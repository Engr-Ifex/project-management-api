/*
 * Phase 4 browser QA.
 *
 * Drives real Chrome against the built app on :4173, which proxies /api to the
 * real backend on :5000. Every check below either passes, fails with a concrete
 * offender list, or is explicitly marked as not-run.
 *
 * Usage:
 *   node dev/qa.mjs            # all checks, all three viewports
 *   node dev/qa.mjs --quick    # geometry + a11y only, desktop
 *
 * Exit code is non-zero when a check fails, so this can gate a release. Wired
 * into `npm run qa`; the full sweep also needs the backend and the preview
 * server, which the script does not start for you — it reports an unreachable
 * app rather than pretending the checks ran.
 *
 * Requires nothing but Chrome and Node's built-in WebSocket, deliberately:
 * adding Playwright to this repo to obtain a tab keypress and a computed colour
 * would be a large dependency for a small need, and the checks here are the
 * ones the product actually depends on.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  A11Y_NAME_CHECK,
  CLIPPED_CHECK,
  CONTRAST_CHECK,
  Cdp,
  DEVICE_PROFILES,
  OVERFLOW_CHECK,
  SEMANTICS_CHECK,
  evaluate,
  findChrome,
  pressKey,
  waitFor,
} from './cdp.mjs';

const APP = process.env.APP_URL ?? 'http://localhost:4173';
const API = process.env.API_URL ?? 'http://localhost:5000';
const QUICK = process.argv.includes('--quick');

const USER = {
  name: 'QA Auditor',
  email: `qa.audit.${Date.now()}@example.com`,
  password: 'Str0ngPassw0rd!qa',
};

const results = [];

const record = (check, viewport, status, detail) => {
  results.push({ check, viewport, status, detail });
  const mark = status === 'PASS' ? 'ok  ' : status === 'FAIL' ? 'FAIL' : 'skip';
  console.log(`${mark} [${viewport}] ${check}${detail ? ` — ${detail}` : ''}`);
};

/* ------------------------------------------------------------------ *
 * Fixture: create a user, workspace, project and task through the real API,
 * so the UI has genuine data and every screen renders its populated state
 * rather than its empty state.
 * ------------------------------------------------------------------ */
const seed = async () => {
  const request = async (pathname, { method = 'GET', body, cookie, form } = {}) => {
    const headers = {};

    if (body) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(`${API}/api/v1${pathname}`, {
      method,
      headers,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });

    const setCookie = response.headers.getSetCookie?.() ?? [];
    const text = await response.text();

    return {
      status: response.status,
      json: text ? JSON.parse(text) : null,
      cookie: setCookie.map((c) => c.split(';')[0]).join('; ') || cookie,
    };
  };

  const registered = await request('/auth/register', { method: 'POST', body: USER });
  if (registered.status !== 201) throw new Error(`register failed: ${registered.status}`);

  const cookie = registered.cookie;

  /*
   * Registration is all that is needed: an account is fully usable the moment it
   * is created, with no confirmation step to satisfy first.
   */
  const workspace = await request('/workspaces', {
    method: 'POST',
    body: { name: 'QA Workspace', description: 'Phase 4 audit' },
    cookie,
  });

  const workspaceId = workspace.json.data.workspace.id;

  const project = await request(`/workspaces/${workspaceId}/projects`, {
    method: 'POST',
    body: { name: 'QA Project', description: 'A project with content for layout testing' },
    cookie,
  });

  const projectId = project.json.data.project._id;

  const taskTitles = [
    'Investigate the horizontal overflow on the task list at 390px',
    'Confirm the confirmation dialog closes on Escape',
    'A very long task title that should truncate rather than push the row wider than the table',
    'Add reduced-motion coverage for the skeleton shimmer',
  ];

  for (const [index, title] of taskTitles.entries()) {
    await request(`/workspaces/${workspaceId}/projects/${projectId}/tasks`, {
      method: 'POST',
      body: {
        title,
        description: 'Seeded by the Phase 4 QA harness.',
        priority: ['low', 'medium', 'high', 'urgent'][index],
        status: ['todo', 'in_progress', 'in_review', 'completed'][index],
        estimatedTime: 30 + index * 15,
      },
      cookie,
    });
  }

  await request(`/workspaces/${workspaceId}/projects/${projectId}/labels`, {
    method: 'POST',
    body: { name: 'qa', color: '#0d9488' },
    cookie,
  });

  await request(`/workspaces/${workspaceId}/invitations`, {
    method: 'POST',
    body: { email: `invitee.${Date.now()}@example.com`, role: 'member' },
    cookie,
  });

  return { workspaceId, projectId, cookie };
};

/*
 * Drop the browser's session so /login will actually render.
 *
 * Uses the real logout endpoint through the page's own fetch, so the httpOnly
 * cookie — which no script can touch — is cleared by the server the same way it
 * is in production. Then re-navigate, because the SPA has no reason to know the
 * cookie changed underneath it.
 */
const signOut = async (cdp) => {
  await evaluate(
    cdp,
    `(async () => {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
      return true;
    })()`
  );
  await cdp.send('Page.navigate', { url: `${APP}/login` });
  await new Promise((resolve) => setTimeout(resolve, 300));
};

/* ------------------------------------------------------------------ *
 * Per-page geometry + accessibility sweep.
 * ------------------------------------------------------------------ */
const auditPage = async (cdp, name, url, viewport) => {
  await cdp.send('Page.navigate', { url });
  await waitFor(
    cdp,
    `document.querySelector('#root') && document.querySelector('#root').children.length > 0`
  );
  await evaluate(cdp, `document.fonts.ready.then(() => true)`);
  await evaluate(
    cdp,
    `(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()`
  );

  const overflow = await evaluate(cdp, OVERFLOW_CHECK);

  if (overflow.overflow <= 1) {
    record(
      `geometry: no horizontal overflow`,
      viewport,
      'PASS',
      `${name} (scrollWidth == clientWidth)`
    );
  } else {
    record(
      `geometry: no horizontal overflow`,
      viewport,
      'FAIL',
      `${name} is ${overflow.overflow}px too wide. Widest offenders: ${overflow.offenders
        .map((o) => `${o.tag}.${o.cls.split(' ')[0] || '?'}(${o.width}px, right=${o.right})`)
        .join(', ')}`
    );
  }

  const clipped = await evaluate(cdp, CLIPPED_CHECK);
  if (clipped.length === 0) {
    record(`geometry: no clipped content`, viewport, 'PASS', name);
  } else {
    record(
      `geometry: no clipped content`,
      viewport,
      'FAIL',
      `${name}: ${clipped.map((c) => `${c.tag}"${c.text}" ${c.scrollH}>${c.clientH}`).join('; ')}`
    );
  }

  const unnamed = await evaluate(cdp, A11Y_NAME_CHECK);
  if (unnamed.length === 0) {
    record(`a11y: every control has a name`, viewport, 'PASS', name);
  } else {
    record(
      `a11y: every control has a name`,
      viewport,
      'FAIL',
      `${name}: ${unnamed.map((u) => `${u.tag}.${u.cls.split(' ')[0] || '?'}`).join(', ')}`
    );
  }

  const semantics = await evaluate(cdp, SEMANTICS_CHECK);
  if (semantics.length === 0) {
    record(`a11y: images labelled, field errors associated`, viewport, 'PASS', name);
  } else {
    record(
      `a11y: images labelled, field errors associated`,
      viewport,
      'FAIL',
      `${name}: ${JSON.stringify(semantics)}`
    );
  }

  const contrast = await evaluate(cdp, CONTRAST_CHECK);
  if (contrast.length === 0) {
    record(`a11y: text contrast >= WCAG AA`, viewport, 'PASS', name);
  } else {
    record(
      `a11y: text contrast >= WCAG AA`,
      viewport,
      'FAIL',
      `${name}: ${contrast.map((c) => `"${c.text}" ${c.ratio}:1 (needs ${c.required})`).join('; ')}`
    );
  }
};

/* ------------------------------------------------------------------ *
 * Interaction checks against the live app.
 * ------------------------------------------------------------------ */
const interactionChecks = async (cdp, ids, logState) => {
  const viewport = 'desktop';

  logState.phase = 'interactions';

  // --- Login flow ---
  /*
   * Sign out first, on purpose.
   *
   * `/login` is wrapped in RequireAnonymous, so a browser that already holds a
   * session is redirected straight to /workspaces and the form never renders.
   * The earlier page sweep ends authenticated, so without this the suite waits
   * for an email input that is never coming. This is the guard working
   * correctly; the harness has to respect it.
   */
  /*
   * Signing out means the next session probe is answered 401, which is the
   * correct response and would otherwise be counted as a console error.
   */
  logState.expectUnauthorized = true;
  await signOut(cdp);

  await cdp.send('Page.navigate', { url: `${APP}/login` });
  await waitFor(cdp, `document.querySelector('input[type="email"]')`);
  await evaluate(cdp, `document.fonts.ready.then(()=>true)`);
  logState.expectUnauthorized = false;

  // Submit empty -> validation errors must appear, and must be associated.
  await evaluate(
    cdp,
    `(() => {
      const form = document.querySelector('form');
      const btn = form.querySelector('button[type="submit"]');
      btn.click();
      return true;
    })()`
  );
  await new Promise((r) => setTimeout(r, 400));

  const emptySubmit = await evaluate(
    cdp,
    `(() => {
      const invalid = [...document.querySelectorAll('[aria-invalid="true"]')];
      return {
        invalidCount: invalid.length,
        described: invalid.map((el) => {
          const ids = (el.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
          return ids.some((id) => document.getElementById(id)?.textContent?.trim());
        }),
        stillOnLogin: location.pathname === '/login',
      };
    })()`
  );

  if (
    emptySubmit.invalidCount > 0 &&
    emptySubmit.described.every(Boolean) &&
    emptySubmit.stillOnLogin
  ) {
    record(
      'form: invalid submit is blocked and errors are announced',
      viewport,
      'PASS',
      `${emptySubmit.invalidCount} field(s)`
    );
  } else {
    record(
      'form: invalid submit is blocked and errors are announced',
      viewport,
      'FAIL',
      JSON.stringify(emptySubmit)
    );
  }

  // Wrong credentials -> a visible error, and no navigation.
  // The 401 this provokes is the expected outcome, so it is excused below.
  logState.expectUnauthorized = true;
  await evaluate(
    cdp,
    `(() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(document.querySelector('input[type="email"]'), ${JSON.stringify(USER.email)});
      const pw = document.querySelector('input[type="password"]');
      set(pw, 'definitely-the-wrong-password');
      return true;
    })()`
  );
  await evaluate(cdp, `document.querySelector('form button[type="submit"]').click()`);
  await new Promise((r) => setTimeout(r, 1200));

  const badLogin = await evaluate(
    cdp,
    `({ path: location.pathname, hasError: Boolean(document.querySelector('[role="alert"]')) })`
  );

  if (badLogin.path === '/login' && badLogin.hasError) {
    record('form: failed login shows an error and does not navigate', viewport, 'PASS', null);
  } else {
    record(
      'form: failed login shows an error and does not navigate',
      viewport,
      'FAIL',
      JSON.stringify(badLogin)
    );
  }

  logState.expectUnauthorized = false;

  // --- Real login, then the authenticated sweep ---
  await evaluate(
    cdp,
    `(() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(document.querySelector('input[type="email"]'), ${JSON.stringify(USER.email)});
      set(document.querySelector('input[type="password"]'), ${JSON.stringify(USER.password)});
      return true;
    })()`
  );
  await evaluate(cdp, `document.querySelector('form button[type="submit"]').click()`);

  try {
    await waitFor(cdp, `location.pathname.startsWith('/workspaces')`, { timeout: 12000 });
    record('auth: valid credentials navigate into the app', viewport, 'PASS', null);
  } catch {
    record('auth: valid credentials navigate into the app', viewport, 'FAIL', 'stayed on /login');
    return;
  }

  // Protected-route refresh: the session must survive a hard reload.
  await cdp.send('Page.navigate', {
    url: `${APP}/workspaces/${ids.workspaceId}/projects/${ids.projectId}`,
  });
  await waitFor(cdp, `document.querySelector('#root').children.length > 0`);
  await evaluate(cdp, `document.fonts.ready.then(()=>true)`);
  await new Promise((r) => setTimeout(r, 1500));

  const refreshed = await evaluate(
    cdp,
    `({ path: location.pathname, authenticated: !location.pathname.includes('/login') })`
  );
  if (refreshed.authenticated && refreshed.path.includes(ids.projectId)) {
    record('state: protected route survives a hard refresh', viewport, 'PASS', null);
  } else {
    record(
      'state: protected route survives a hard refresh',
      viewport,
      'FAIL',
      JSON.stringify(refreshed)
    );
  }

  // Search / filter must change the result count.
  const searchResult = await evaluate(
    cdp,
    `(async () => {
      const input = document.querySelector('input[type="search"], input[placeholder*="Search" i]');
      if (!input) return { skipped: true };

      const countRows = () => document.querySelectorAll('tbody tr').length;
      const before = countRows();

      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };

      set(input, 'zzzz-no-such-task-zzzz');
      await new Promise((r) => setTimeout(r, 1400));
      const after = countRows();

      set(input, '');
      await new Promise((r) => setTimeout(r, 1400));
      const restored = countRows();

      return { before, after, restored };
    })()`
  );

  if (searchResult.skipped) {
    record(
      'interaction: search updates the result set',
      viewport,
      'skip',
      'no search input on this screen'
    );
  } else if (
    searchResult.after < searchResult.before &&
    searchResult.restored === searchResult.before
  ) {
    record(
      'interaction: search updates the result set',
      viewport,
      'PASS',
      `${searchResult.before} -> ${searchResult.after} -> ${searchResult.restored}`
    );
  } else {
    record(
      'interaction: search updates the result set',
      viewport,
      'FAIL',
      JSON.stringify(searchResult)
    );
  }

  // Destructive action must be confirmed, and Escape must cancel it.
  const dialogResult = await evaluate(
    cdp,
    `(async () => {
      const archiveButton = [...document.querySelectorAll('button')].find((b) =>
        /archive/i.test(b.textContent || '') || /archive/i.test(b.getAttribute('aria-label') || '')
      );

      if (!archiveButton) return { skipped: true };

      archiveButton.click();
      await new Promise((r) => setTimeout(r, 500));

      const opened = Boolean(document.querySelector('[role="dialog"]'));
      if (!opened) return { opened: false };

      const dialog = document.querySelector('[role="dialog"]');
      const title = dialog.querySelector('[id]')?.textContent || '';
      const buttons = [...dialog.querySelectorAll('button')].map((b) => (b.textContent || '').trim());

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));

      return { opened, title, buttons, closedOnEscape: !document.querySelector('[role="dialog"]') };
    })()`
  );

  if (dialogResult.skipped) {
    record(
      'interaction: destructive action is confirmed',
      viewport,
      'skip',
      'no archive control on this screen'
    );
  } else if (
    dialogResult.opened &&
    dialogResult.closedOnEscape &&
    dialogResult.buttons.length >= 2
  ) {
    record(
      'interaction: destructive action confirms and Escape dismisses',
      viewport,
      'PASS',
      dialogResult.title.slice(0, 40)
    );
  } else {
    record(
      'interaction: destructive action confirms and Escape dismisses',
      viewport,
      'FAIL',
      JSON.stringify(dialogResult)
    );
  }

  /*
   * Keyboard: the skip link must be the first tab stop and must become visible
   * when it takes focus.
   *
   * Driven with real Tab key events, not `element.focus()`. Calling focus()
   * from script does not make the browser treat the focus as keyboard-originated,
   * so `:focus-visible` never matches and the link stays parked off-screen —
   * the check would fail against a page that is actually correct. Only a
   * genuine key event exercises the rule as a user would meet it.
   */
  await cdp.send('Page.navigate', { url: `${APP}/workspaces/${ids.workspaceId}` });
  await waitFor(cdp, `document.querySelector('[data-skip-link]')`);
  await evaluate(cdp, `document.fonts.ready.then(()=>true)`);
  await new Promise((r) => setTimeout(r, 500));

  await pressKey(cdp, 'Tab');

  const skip = await evaluate(
    cdp,
    `(() => {
      const link = document.querySelector('[data-skip-link]');
      if (!link) return { present: false };
      const focused = document.activeElement === link;
      const r = link.getBoundingClientRect();
      const style = getComputedStyle(link);
      return {
        present: true,
        focused,
        // On-screen means the reveal rule fired, not merely that it has a box.
        visible: r.left >= 0 && r.top >= 0 && r.width > 0,
        outline: style.outlineStyle,
      };
    })()`
  );

  if (skip.present && skip.focused && skip.visible) {
    record('keyboard: skip link is the first tab stop and becomes visible', viewport, 'PASS', null);
  } else {
    record(
      'keyboard: skip link is the first tab stop and becomes visible',
      viewport,
      'FAIL',
      JSON.stringify(skip)
    );
  }

  // Focus ring must actually paint on a keyboard-focused control.
  await pressKey(cdp, 'Tab');

  const focusRing = await evaluate(
    cdp,
    `(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { skipped: true };
      const style = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
      };
    })()`
  );

  const ringVisible =
    focusRing.skipped !== true &&
    focusRing.outlineStyle !== 'none' &&
    parseFloat(focusRing.outlineWidth) > 0;

  if (ringVisible) {
    record(
      'keyboard: focused control paints a visible ring',
      viewport,
      'PASS',
      `${focusRing.outlineWidth} ${focusRing.outlineColor}`
    );
  } else if (focusRing.skipped) {
    record(
      'keyboard: focused control paints a visible ring',
      viewport,
      'skip',
      'no nav on this screen'
    );
  } else {
    record(
      'keyboard: focused control paints a visible ring',
      viewport,
      'FAIL',
      JSON.stringify(focusRing)
    );
  }

  // Success feedback must only follow a real success.
  const toastCheck = await evaluate(
    cdp,
    `(async () => {
      const trigger = [...document.querySelectorAll('button')].find((b) =>
        /new project|create project|new task|add task/i.test(b.textContent || '')
      );
      if (!trigger) return { skipped: true };

      trigger.click();
      await new Promise((r) => setTimeout(r, 400));

      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { skipped: true, reason: 'no dialog opened' };

      const submit = [...dialog.querySelectorAll('button[type="submit"], button')].find((b) =>
        /create|save|add/i.test(b.textContent || '')
      );
      if (!submit) return { skipped: true, reason: 'no submit in dialog' };

      // Submit empty: no toast may appear for a request that was never sent.
      submit.click();
      await new Promise((r) => setTimeout(r, 900));

      const toastAfterInvalid = Boolean(document.querySelector('[role="status"], [data-radix-toast-root], li[role="status"]'));
      const dialogStillOpen = Boolean(document.querySelector('[role="dialog"]'));

      return { toastAfterInvalid, dialogStillOpen };
    })()`
  );

  if (toastCheck.skipped) {
    record(
      'state: no success message without a successful request',
      viewport,
      'skip',
      toastCheck.reason ?? 'no create control'
    );
  } else if (!toastCheck.toastAfterInvalid && toastCheck.dialogStillOpen) {
    record(
      'state: no success message without a successful request',
      viewport,
      'PASS',
      'empty submit produced no success toast'
    );
  } else {
    record(
      'state: no success message without a successful request',
      viewport,
      'FAIL',
      JSON.stringify(toastCheck)
    );
  }
};

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */
const main = async () => {
  const chrome = findChrome();
  const profile = mkdtempSync(path.join(tmpdir(), 'qa-cdp-'));

  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--remote-debugging-port=9222',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  const cleanup = () => {
    try {
      child.kill();
    } catch {
      /* already dead */
    }
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  };

  try {
    // Wait for the debugging endpoint.
    let version;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        version = await (await fetch('http://127.0.0.1:9222/json/version')).json();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    if (!version) throw new Error('Chrome did not expose a debugging port.');

    const target = await (
      await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })
    ).json();

    const cdp = await new Cdp(target.webSocketDebuggerUrl).connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    const consoleErrors = [];

    /*
     * Console errors are tagged with the phase that produced them, and with
     * whether a 401 was provoked on purpose. Only the wrong-password and
     * anonymous-probe checks set `expectUnauthorized`, so a genuine 401 from
     * any other request still fails the sweep.
     */
    const logState = { phase: 'startup', expectUnauthorized: false };

    cdp.on('Log.entryAdded', ({ entry }) => {
      if (entry.level !== 'error') return;
      consoleErrors.push({
        phase: logState.phase,
        text: entry.text?.slice(0, 200),
        expected401: logState.expectUnauthorized && /401/.test(entry.text ?? ''),
      });
    });
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      consoleErrors.push({
        phase: logState.phase,
        text: `uncaught: ${exceptionDetails.exception?.description?.slice(0, 200)}`,
      });
    });

    console.log(`\nChrome: ${version['Browser']}`);
    console.log(`App:    ${APP}\n`);

    const ids = await seed();
    console.log(`Seeded workspace ${ids.workspaceId}, project ${ids.projectId}\n`);

    // Log in once so the browser carries the session cookie for the sweep.
    /*
     * The first /login load probes the session with no cookie, so the 401 that
     * produces is the correct answer rather than a defect. This is the same
     * situation the sign-out path creates later, so it is flagged the same way.
     */
    logState.phase = 'login';
    logState.expectUnauthorized = true;
    await cdp.send('Page.navigate', { url: `${APP}/login` });
    await waitFor(cdp, `document.querySelector('input[type="email"]')`);
    logState.expectUnauthorized = false;

    await evaluate(
      cdp,
      `(() => {
        const set = (el, v) => {
          const proto = Object.getPrototypeOf(el);
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set(document.querySelector('input[type="email"]'), ${JSON.stringify(USER.email)});
        set(document.querySelector('input[type="password"]'), ${JSON.stringify(USER.password)});
        return true;
      })()`
    );
    await evaluate(cdp, `document.querySelector('form button[type="submit"]').click()`);
    await waitFor(cdp, `location.pathname.startsWith('/workspaces')`, { timeout: 12000 });

    const pages = [
      ['Workspace list', `${APP}/workspaces`],
      ['Dashboard', `${APP}/workspaces/${ids.workspaceId}`],
      ['Project list', `${APP}/workspaces/${ids.workspaceId}/projects`],
      ['Project overview', `${APP}/workspaces/${ids.workspaceId}/projects/${ids.projectId}`],
      ['Members', `${APP}/workspaces/${ids.workspaceId}/members`],
      ['Notifications', `${APP}/workspaces/${ids.workspaceId}/notifications`],
      ['Settings', `${APP}/workspaces/${ids.workspaceId}/settings`],
      ['Design system', `${APP}/design`],
    ];

    const viewports = QUICK ? ['desktop'] : ['desktop', 'tablet', 'mobile'];

    const applyViewport = async (name) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        ...DEVICE_PROFILES[name],
        screenWidth: DEVICE_PROFILES[name].width,
        screenHeight: DEVICE_PROFILES[name].height,
        mobile: DEVICE_PROFILES[name].isMobile,
      });
    };

    for (const device of viewports) {
      await applyViewport(device);
      console.log(`\n--- ${device} (${DEVICE_PROFILES[device].width}px) ---`);
      logState.phase = `sweep:${device}`;

      for (const [name, url] of pages) {
        try {
          await auditPage(cdp, name, url, device);
        } catch (error) {
          record('page audit', device, 'FAIL', `${name}: ${error.message}`);
        }
      }
    }

    // Task detail needs a real task id.
    const taskList = await (
      await fetch(`${API}/api/v1/workspaces/${ids.workspaceId}/projects/${ids.projectId}/tasks`, {
        headers: { Cookie: ids.cookie },
      })
    ).json();

    const taskId = taskList.data.tasks[0]?._id;

    if (taskId) {
      for (const device of viewports) {
        await applyViewport(device);
        console.log(`\n--- ${device}: task detail ---`);
        logState.phase = `task-detail:${device}`;
        await auditPage(
          cdp,
          'Task detail',
          `${APP}/workspaces/${ids.workspaceId}/projects/${ids.projectId}/tasks/${taskId}`,
          device
        );
      }
    }

    if (!QUICK) {
      await applyViewport('desktop');
      console.log('\n--- interactions ---');
      await interactionChecks(cdp, ids, logState);
    }

    console.log('\n--- console health ---');
    /*
     * A 401 is the correct answer to two requests this suite makes on purpose:
     * the wrong-password login, and a protected-route probe with no session.
     * Those are tagged with the phase they happened in so they can be excused
     * precisely, rather than by matching the message text — a
     * `text.includes('401')` filter would also hide a real 401 from an
     * unrelated request, which is exactly the bug worth catching.
     */
    const realErrors = consoleErrors.filter((entry) => {
      const text = typeof entry === 'string' ? entry : entry.text;
      if (/favicon|Download the React DevTools|net::ERR_/i.test(text)) return false;
      if (typeof entry === 'object' && entry.expected401) return false;
      return true;
    });

    if (realErrors.length === 0) {
      record('runtime: no unexpected console errors during the sweep', 'all', 'PASS', null);
    } else {
      record(
        'runtime: no unexpected console errors during the sweep',
        'all',
        'FAIL',
        realErrors
          .map((e) => (typeof e === 'string' ? e : `${e.phase}: ${e.text}`))
          .slice(0, 5)
          .join(' | ')
      );
    }

    const failed = results.filter((r) => r.status === 'FAIL');
    const passed = results.filter((r) => r.status === 'PASS');
    const skipped = results.filter((r) => r.status === 'skip');

    console.log(
      `\n===== ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped =====\n`
    );

    writeFileSync(
      path.join(process.cwd(), 'qa-results.json'),
      JSON.stringify(
        { when: new Date().toISOString(), browser: version['Browser'], results },
        null,
        2
      )
    );

    cdp.close();

    if (failed.length > 0) process.exitCode = 1;
  } finally {
    cleanup();
  }
};

main().catch((error) => {
  console.error('QA harness failed:', error);
  process.exitCode = 1;
});
