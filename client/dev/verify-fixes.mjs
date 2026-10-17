/*
 * Manual-regression checklist for the seven reported bugs, automated.
 *
 * Drives real Chrome against the built app on :4173 (which proxies /api and
 * /uploads to the real backend on :5000) and asserts the *behaviour* the user
 * reported, not the shape of the code that was changed. Each check states what
 * it is proving, so a failure names the symptom rather than an assertion id.
 *
 * Usage:
 *   node dev/verify-fixes.mjs            # all checks
 *   node dev/verify-fixes.mjs --headed   # keep the browser open on failure
 *
 * Exit code is non-zero when any check fails.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { Cdp, DEVICE_PROFILES, evaluate, findChrome, waitFor } from './cdp.mjs';

const APP = process.env.APP_URL ?? 'http://localhost:4173';
const API = process.env.API_URL ?? 'http://localhost:5000';

const USER = {
  name: 'Fix Verifier',
  email: `fix.verify.${Date.now()}@example.com`,
  password: 'Str0ngPass!234',
};

/* A 1x1 JPEG with genuine magic bytes, so the content check accepts it. */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const results = [];

const record = (issue, check, status, detail) => {
  results.push({ issue, check, status, detail });
  const mark = status === 'PASS' ? 'ok  ' : 'FAIL';
  console.log(`${mark} [${issue}] ${check}${detail ? ` — ${detail}` : ''}`);
};

/** Runs `fn`, recording a FAIL with the thrown message rather than crashing. */
const check = async (issue, label, fn) => {
  try {
    const detail = await fn();
    record(issue, label, 'PASS', typeof detail === 'string' ? detail : null);
  } catch (error) {
    record(issue, label, 'FAIL', error.message);
  }
};

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

/* --------------------------------------------------------------- fixtures */

const api = async (path, { method = 'GET', body, cookie } = {}) => {
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  return { status: response.status, body: parsed, setCookie: response.headers.get('set-cookie') };
};

const seed = async () => {
  const register = await api('/auth/register', {
    method: 'POST',
    body: { name: USER.name, email: USER.email, password: USER.password },
  });

  assert(register.status === 201, `register failed: ${register.status} ${register.body?.message}`);

  const cookie = (register.setCookie ?? '').split(';')[0];

  assert(cookie.startsWith('accessToken='), `no session cookie was returned: "${cookie}"`);

  /*
   * No confirmation step: registration produces a fully usable account, so the
   * seed can go straight on to creating its workspace.
   */
  const workspace = await api('/workspaces', {
    method: 'POST',
    cookie,
    body: { name: 'Fix Workspace' },
  });

  /*
   * `Workspace` and `User` serialize `_id` as `id`; every other model keeps
   * `_id`. Accepting both here is the same normalisation the app's own
   * `refId()` does, and it stops the seed from breaking on that split.
   */
  const workspaceId = workspace.body?.data?.workspace?.id ?? workspace.body?.data?.workspace?._id;

  assert(
    workspaceId,
    `workspace creation failed: ${workspace.status} ${workspace.body?.message} ${JSON.stringify(workspace.body?.errors ?? [])}`
  );

  const project = await api(`/workspaces/${workspaceId}/projects`, {
    method: 'POST',
    cookie,
    body: { name: 'Fix Project' },
  });

  const projectId = project.body?.data?.project?._id;

  assert(
    projectId,
    `project creation failed: ${project.status} ${project.body?.message} ${JSON.stringify(project.body?.errors ?? [])}`
  );

  const tasksUrl = `/workspaces/${workspaceId}/projects/${projectId}/tasks`;

  const first = await api(tasksUrl, {
    method: 'POST',
    cookie,
    body: { title: 'Existing task' },
  });

  return {
    cookie,
    workspaceId,
    projectId,
    tasksUrl,
    taskId: first.body.data.task._id,
  };
};

/* ------------------------------------------------------------------ main */

const main = async () => {
  const profile = mkdtempSync(`${tmpdir()}/verify-`);
  const chrome = spawn(findChrome(), [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
  ]);

  try {
    let version;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        version = await (await fetch('http://127.0.0.1:9222/json/version')).json();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    if (!version) fail('Chrome did not expose a debugging port.');

    const target = await (
      await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })
    ).json();

    const cdp = await new Cdp(target.webSocketDebuggerUrl).connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    console.log(`\nChrome: ${version.Browser}`);
    console.log(`App:    ${APP}\n`);

    const ids = await seed();
    console.log(`Seeded workspace ${ids.workspaceId}, project ${ids.projectId}\n`);

    /* ---------------------------------------------------- Issue 7: PROJEX */

    /*
     * Checked before the session cookie is set, deliberately.
     *
     * `/login` is wrapped in `RequireAnonymous`, so an authenticated browser is
     * redirected off it — the sign-in screen only renders for an anonymous one.
     * Setting the cookie first would test the workspace list and call it the
     * auth shell.
     */
    console.log('--- Issue 7: branding ---');

    await cdp.send('Page.navigate', { url: `${APP}/login` });
    await waitFor(cdp, `document.querySelector('input[type="email"]')`);

    await check('7', 'the browser tab reads PROJEX', async () => {
      const title = await evaluate(cdp, `document.title`);
      assert(/PROJEX/.test(title), `document.title was "${title}"`);
      return title;
    });

    await check('7', 'the sign-in screen shows PROJEX', async () => {
      const text = await evaluate(cdp, `document.body.innerText`);
      assert(text.includes('PROJEX'), 'PROJEX not found on the sign-in screen');
      assert(
        !/Project Management/.test(text),
        'the old product name is still rendered on the sign-in screen'
      );
      return null;
    });

    /*
     * Set the session cookie directly rather than driving the login form.
     * The cookie is httpOnly, so this is the only way a script can establish
     * the session — and the login form itself is covered by `qa.mjs`.
     */
    const [cookieName, cookieValue] = ids.cookie.split('=');
    await cdp.send('Network.setCookie', {
      name: cookieName,
      value: cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });

    await check('7', 'the workspace list shows PROJEX', async () => {
      await cdp.send('Page.navigate', { url: `${APP}/workspaces` });

      // Guard `document.body`: mid-navigation it is null, and reading
      // `.innerText` off it throws rather than returning false.
      await waitFor(cdp, `document.body && document.body.innerText.includes('PROJEX')`, {
        timeout: 20000,
      });

      const text = await evaluate(cdp, `document.body.innerText`);

      assert(
        !/Project Management/.test(text),
        'the old product name is still rendered on the workspace list'
      );

      return null;
    });

    /* ------------------------------------------- Issue 1: dialog clipping */

    console.log('\n--- Issue 1: New Task dialog ---');

    const projectUrl = `${APP}/workspaces/${ids.workspaceId}/projects/${ids.projectId}`;

    /*
     * Wait for the button itself, not just "a button". The app shell renders its
     * own buttons immediately, so a loose wait returns before the task list has
     * loaded and the New task button exists at all.
     */
    const newTaskButton = `[...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'New task')`;

    /*
     * Explicit viewport sizes rather than the `mobile: true` device profiles.
     *
     * The question here is a layout question — "do the action buttons fit in a
     * 390px-wide viewport?" — and `mobile: true` adds Chrome's page-scale and
     * text-autosizing behaviour on top of the size, which made the emulated
     * width come back as 394 or 437 instead of 390 depending on timing. A plain
     * viewport override measures the thing being claimed, deterministically.
     */
    const VIEWPORTS = [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'tablet', width: 834, height: 1112 },
      { name: 'mobile', width: 390, height: 844 },
    ];

    for (const viewportSpec of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewportSpec.width,
        height: viewportSpec.height,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: viewportSpec.width,
        screenHeight: viewportSpec.height,
      });

      await cdp.send('Page.navigate', { url: projectUrl });

      await check('1', `the action buttons are fully visible (${viewportSpec.name})`, async () => {
        await waitFor(cdp, newTaskButton, { timeout: 20000 });
        await evaluate(cdp, `document.fonts.ready.then(()=>true)`);

        await evaluate(cdp, `(() => { ${newTaskButton}.click(); return true; })()`);

        await waitFor(cdp, `document.querySelector('[role="dialog"]')`);
        await new Promise((resolve) => setTimeout(resolve, 250));

        const geometry = await evaluate(
          cdp,
          `(() => {
            const dialog = document.querySelector('[role="dialog"]');
            const buttons = [...dialog.querySelectorAll('button')].filter((el) =>
              ['Cancel', 'Create task'].includes(el.textContent.trim())
            );

            const rects = buttons.map((el) => {
              const r = el.getBoundingClientRect();
              return {
                label: el.textContent.trim(),
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
                left: Math.round(r.left),
                right: Math.round(r.right),
                width: Math.round(r.width),
                height: Math.round(r.height),
              };
            });

            const dialogRect = dialog.getBoundingClientRect();

            return {
              labels: rects.map((r) => r.label),
              rects,
              viewport: { w: window.innerWidth, h: window.innerHeight },
              dialog: {
                top: Math.round(dialogRect.top),
                bottom: Math.round(dialogRect.bottom),
                height: Math.round(dialogRect.height),
              },
            };
          })()`
        );

        assert(
          geometry.labels.length === 2,
          `expected Cancel and Create task, found ${JSON.stringify(geometry.labels)}`
        );

        for (const rect of geometry.rects) {
          assert(rect.height > 0 && rect.width > 0, `"${rect.label}" has no box`);

          assert(
            rect.bottom <= geometry.viewport.h,
            `"${rect.label}" bottom (${rect.bottom}) is below the viewport (${geometry.viewport.h})`
          );

          assert(rect.top >= 0, `"${rect.label}" top (${rect.top}) is above the viewport`);

          assert(
            rect.bottom <= geometry.dialog.bottom + 1,
            `"${rect.label}" is clipped by the dialog: button bottom ${rect.bottom}, dialog bottom ${geometry.dialog.bottom}`
          );

          assert(
            rect.right <= geometry.viewport.w,
            `"${rect.label}" right edge (${rect.right}) overflows the viewport (${geometry.viewport.w})`
          );
        }

        // Close again so the next viewport starts clean.
        await evaluate(
          cdp,
          `(() => {
            const cancel = [...document.querySelectorAll('[role="dialog"] button')].find(
              (el) => el.textContent.trim() === 'Cancel'
            );
            if (cancel) cancel.click();
            return true;
          })()`
        );

        return `${geometry.viewport.w}x${geometry.viewport.h}, dialog ${geometry.dialog.height}px tall`;
      });
    }

    /*
     * The scrolling case, which the sizes above never reach.
     *
     * At 390x844 the whole dialog fits, so `ModalBody` has nothing to scroll and
     * the check above would pass even if the scroll container were broken. A
     * deliberately short viewport forces the body to overflow, which is the only
     * way to prove that (a) the dialog is capped to the viewport rather than
     * growing past it, (b) the body takes the overflow instead of the footer,
     * and (c) the footer stays visible and reachable while the body scrolls.
     */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 420,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 390,
      screenHeight: 420,
    });

    await cdp.send('Page.navigate', { url: projectUrl });

    await check('1', 'a long form scrolls while the footer stays visible (390x420)', async () => {
      await waitFor(cdp, newTaskButton, { timeout: 20000 });
      await evaluate(cdp, `(() => { ${newTaskButton}.click(); return true; })()`);
      await waitFor(cdp, `document.querySelector('[role="dialog"]')`);
      await new Promise((resolve) => setTimeout(resolve, 250));

      const state = await evaluate(
        cdp,
        `(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const body = dialog.querySelector('.overflow-y-auto');

          const buttons = [...dialog.querySelectorAll('button')].filter((el) =>
            ['Cancel', 'Create task'].includes(el.textContent.trim())
          );

          return {
            viewportH: window.innerHeight,
            dialogBottom: Math.round(dialog.getBoundingClientRect().bottom),
            bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : null,
            bodyClientH: body ? body.clientHeight : null,
            bodyScrollH: body ? body.scrollHeight : null,
            buttons: buttons.map((el) => {
              const r = el.getBoundingClientRect();
              return { label: el.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom) };
            }),
          };
        })()`
      );

      assert(
        state.dialogBottom <= state.viewportH,
        `the dialog bottom (${state.dialogBottom}) is past the viewport (${state.viewportH})`
      );

      assert(
        state.bodyScrolls === true,
        `the body did not become scrollable, so the form is being clipped instead: ${JSON.stringify(state)}`
      );

      assert(state.buttons.length === 2, 'both footer buttons should be present');

      for (const button of state.buttons) {
        assert(
          button.top >= 0 && button.bottom <= state.viewportH,
          `"${button.label}" (${button.top}–${button.bottom}) is outside the viewport (${state.viewportH})`
        );
      }

      await evaluate(
        cdp,
        `(() => {
          const cancel = [...document.querySelectorAll('[role="dialog"] button')].find(
            (el) => el.textContent.trim() === 'Cancel'
          );
          if (cancel) cancel.click();
          return true;
        })()`
      );

      return `body scrolls ${state.bodyScrollH}px in ${state.bodyClientH}px; footer visible`;
    });

    /* ---------------------------------------------- Issue 2: due date --- */

    console.log('\n--- Issue 2: due date ---');

    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...DEVICE_PROFILES.desktop,
      screenWidth: DEVICE_PROFILES.desktop.width,
      screenHeight: DEVICE_PROFILES.desktop.height,
      mobile: false,
    });

    await cdp.send('Page.navigate', { url: projectUrl });

    // A date far enough out that the picked day is unambiguous.
    const pickedDate = '2026-11-19';

    await check('2', 'creating a task with a due date succeeds', async () => {
      await waitFor(cdp, newTaskButton, { timeout: 20000 });

      await evaluate(cdp, `(() => { ${newTaskButton}.click(); return true; })()`);

      await waitFor(cdp, `document.querySelector('[role="dialog"] input')`);
      await new Promise((resolve) => setTimeout(resolve, 200));

      await evaluate(
        cdp,
        `(() => {
          const dialog = document.querySelector('[role="dialog"]');

          const setValue = (el, value) => {
            const proto = Object.getPrototypeOf(el);
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          };

          setValue(dialog.querySelector('input:not([type="date"])'), 'Task with a due date');
          setValue(dialog.querySelector('input[type="date"]'), ${JSON.stringify(pickedDate)});

          return true;
        })()`
      );

      await evaluate(
        cdp,
        `(() => {
          const submit = [...document.querySelectorAll('[role="dialog"] button')].find(
            (el) => el.textContent.trim() === 'Create task'
          );
          submit.click();
          return true;
        })()`
      );

      // The dialog closing is the client-side signal that the API accepted it.
      await waitFor(cdp, `!document.querySelector('[role="dialog"]')`, { timeout: 12000 });

      const list = await api(ids.tasksUrl, { cookie: ids.cookie });
      const created = list.body.data.tasks.find((task) => task.title === 'Task with a due date');

      assert(created, 'the task was not created');
      assert(created.dueDate, 'the task was created but its due date was not saved');

      return `stored ${new Date(created.dueDate).toISOString()}`;
    });

    await check('2', 'the stored date is the day that was picked', async () => {
      const list = await api(ids.tasksUrl, { cookie: ids.cookie });
      const created = list.body.data.tasks.find((task) => task.title === 'Task with a due date');

      const storedDay = created.dueDate.slice(0, 10);

      assert(storedDay === pickedDate, `picked ${pickedDate} but the API stored ${storedDay}`);

      return storedDay;
    });

    await check('2', 'the list renders the picked day, not a day earlier', async () => {
      await cdp.send('Page.navigate', { url: projectUrl });

      /*
       * Guard `document.body`: a predicate evaluated mid-navigation sees a null
       * body, and `document.body.innerText` then throws instead of returning
       * false — which fails the check for a reason that has nothing to do with
       * the product.
       */
      await waitFor(
        cdp,
        `document.body && document.body.innerText.includes('Task with a due date')`,
        { timeout: 20000 }
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      const rendered = await evaluate(
        cdp,
        `(() => {
          const row = [...document.querySelectorAll('tr')].find((tr) =>
            tr.textContent.includes('Task with a due date')
          );
          if (!row) return null;

          // The date cell is the numeric one before the actions column.
          const cells = [...row.querySelectorAll('td')].map((td) => td.textContent.trim());
          return cells;
        })()`
      );

      assert(rendered, 'the task row was not found');

      // 2026-11-19 in the user's locale short form.
      const expected = new Date(`${pickedDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
        timeZone: 'UTC',
      });

      assert(
        rendered.some((cell) => cell === expected),
        `expected the row to contain "${expected}", found ${JSON.stringify(rendered)}`
      );

      return expected;
    });

    /* ------------------------------------ Issue 4: status/priority/assignee */

    console.log('\n--- Issue 4: task field updates ---');

    await cdp.send('Page.navigate', {
      url: `${APP}/workspaces/${ids.workspaceId}/projects/${ids.projectId}/tasks/${ids.taskId}`,
    });
    await waitFor(cdp, `document.querySelector('[aria-label="Status"]')`);
    await evaluate(cdp, `document.fonts.ready.then(()=>true)`);
    await new Promise((resolve) => setTimeout(resolve, 400));

    /** Opens a Radix select by aria-label and picks an option by its text. */
    const chooseOption = async (ariaLabel, optionText) => {
      const opened = await evaluate(
        cdp,
        `(() => {
          const trigger = document.querySelector('[aria-label=${JSON.stringify(ariaLabel)}]');
          if (!trigger) return false;
          trigger.focus();
          trigger.click();
          return true;
        })()`
      );

      assert(opened, `the "${ariaLabel}" control was not found`);

      await waitFor(cdp, `document.querySelector('[role="option"]')`);
      await new Promise((resolve) => setTimeout(resolve, 150));

      const picked = await evaluate(
        cdp,
        `(() => {
          const option = [...document.querySelectorAll('[role="option"]')].find(
            (el) => el.textContent.trim() === ${JSON.stringify(optionText)}
          );
          if (!option) return false;
          option.click();
          return true;
        })()`
      );

      assert(picked, `the option "${optionText}" was not found in "${ariaLabel}"`);

      // Let the mutation round-trip.
      await new Promise((resolve) => setTimeout(resolve, 900));
    };

    await check('4', 'changing status persists to the API', async () => {
      await chooseOption('Status', 'In progress');

      const response = await api(
        `/workspaces/${ids.workspaceId}/projects/${ids.projectId}/tasks/${ids.taskId}`,
        { cookie: ids.cookie }
      );

      const status = response.body.data.task.status;

      assert(status === 'in_progress', `the API still reports status "${status}"`);

      return status;
    });

    await check('4', 'changing priority persists to the API', async () => {
      await chooseOption('Priority', 'Urgent');

      const response = await api(
        `/workspaces/${ids.workspaceId}/projects/${ids.projectId}/tasks/${ids.taskId}`,
        { cookie: ids.cookie }
      );

      const priority = response.body.data.task.priority;

      assert(priority === 'urgent', `the API still reports priority "${priority}"`);

      return priority;
    });

    await check('4', 'assigning persists to the API', async () => {
      await chooseOption('Assignee', USER.name);

      const response = await api(
        `/workspaces/${ids.workspaceId}/projects/${ids.projectId}/tasks/${ids.taskId}`,
        { cookie: ids.cookie }
      );

      const assignee = response.body.data.task.assignee;
      const name = typeof assignee === 'object' && assignee ? assignee.name : assignee;

      assert(name === USER.name, `the API reports the assignee as ${JSON.stringify(assignee)}`);

      return name;
    });

    await check('4', 'the change survives a reload', async () => {
      await cdp.send('Page.navigate', {
        url: `${APP}/workspaces/${ids.workspaceId}/projects/${ids.projectId}/tasks/${ids.taskId}`,
      });
      await waitFor(cdp, `document.querySelector('[aria-label="Status"]')`);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const shown = await evaluate(
        cdp,
        `(() => {
          const text = (label) => {
            const el = document.querySelector('[aria-label="' + label + '"]');
            return el ? el.textContent.trim() : null;
          };
          return { status: text('Status'), priority: text('Priority'), assignee: text('Assignee') };
        })()`
      );

      assert(shown.status === 'In progress', `after reload the status reads "${shown.status}"`);
      assert(shown.priority === 'Urgent', `after reload the priority reads "${shown.priority}"`);
      assert(shown.assignee === USER.name, `after reload the assignee reads "${shown.assignee}"`);

      return `status=${shown.status}, priority=${shown.priority}, assignee=${shown.assignee}`;
    });

    /* ------------------------------------ Issue 5: label/value alignment -- */

    console.log('\n--- Issue 5: metadata alignment ---');

    /** Every header cell and its column's value cell must share an alignment. */
    const alignmentOf = async (url, headerText) => {
      await cdp.send('Page.navigate', { url });

      /*
       * Wait for a *data* row, not merely a table.
       *
       * Two things have to be excluded, and both would otherwise fail this
       * check against a correct page:
       *
       *   - `TableMessage` — the empty/error state is a single full-width cell
       *     with a `colSpan`, so indexing it by column returns the message.
       *   - `TableSkeletonRows` — the loading state renders rows with exactly
       *     one placeholder cell per column, so a skeleton row has the right
       *     *shape* and the wrong *alignment* (a plain `<td>` defaults to left).
       *     Measuring one reports "header right, value left" on a page that is
       *     about to be correct.
       *
       * A real row is therefore one with a cell per header and no shimmer.
       */
      const findRealRows = `
        const headerCount = document.querySelectorAll('table th').length;
        const realRows = [...document.querySelectorAll('table tbody tr')].filter(
          (tr) =>
            tr.querySelectorAll('td').length === headerCount &&
            !tr.querySelector('.skeleton-shimmer')
        );
      `;

      await waitFor(cdp, `(() => { ${findRealRows} return realRows.length > 0; })()`, {
        timeout: 20000,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      return evaluate(
        cdp,
        `(() => {
          ${findRealRows}

          const headers = [...document.querySelectorAll('table th')];
          const index = headers.findIndex(
            (th) => th.textContent.trim() === ${JSON.stringify(headerText)}
          );
          if (index === -1) {
            return { found: false, reason: 'no header with that text' };
          }

          const firstRow = realRows[0];
          if (!firstRow) return { found: false, reason: 'no loaded data row' };

          const value = firstRow.querySelectorAll('td')[index];
          if (!value) return { found: false, reason: 'no cell in that column' };

          return {
            found: true,
            headerAlign: getComputedStyle(headers[index]).textAlign,
            valueAlign: getComputedStyle(value).textAlign,
          };
        })()`
      );
    };

    await check('5', 'task list: the Due header aligns with its date', async () => {
      const result = await alignmentOf(
        `${APP}/workspaces/${ids.workspaceId}/projects/${ids.projectId}`,
        'Due'
      );

      assert(result.found, 'the Due column was not found');
      assert(
        result.headerAlign === result.valueAlign,
        `header is ${result.headerAlign} but the value is ${result.valueAlign}`
      );

      return `both ${result.headerAlign}`;
    });

    for (const header of ['Deadline', 'Updated']) {
      await check('5', `project list: the ${header} header aligns with its date`, async () => {
        const result = await alignmentOf(`${APP}/workspaces/${ids.workspaceId}/projects`, header);

        assert(result.found, `the ${header} column was not found`);
        assert(
          result.headerAlign === result.valueAlign,
          `header is ${result.headerAlign} but the value is ${result.valueAlign}`
        );

        return `both ${result.headerAlign}`;
      });
    }

    await check('5', 'members: the Joined header aligns with its date', async () => {
      const result = await alignmentOf(`${APP}/workspaces/${ids.workspaceId}/members`, 'Joined');

      assert(result.found, 'the Joined column was not found');
      assert(
        result.headerAlign === result.valueAlign,
        `header is ${result.headerAlign} but the value is ${result.valueAlign}`
      );

      return `both ${result.headerAlign}`;
    });

    /* ------------------------------------------- Issue 6: avatar upload -- */

    console.log('\n--- Issue 6: avatar upload ---');

    await check('6', 'the avatar renders after an upload', async () => {
      await cdp.send('Page.navigate', { url: `${APP}/workspaces/${ids.workspaceId}/settings` });
      await waitFor(cdp, `document.querySelector('input[type="file"]')`);
      await new Promise((resolve) => setTimeout(resolve, 400));

      /*
       * The image bytes are handed to the page as a global rather than
       * interpolated into the expression below. The base64 contains `/` and `+`,
       * and nesting it inside a template literal that is itself evaluated in
       * the page is a reliable way to produce a syntax error in the page instead
       * of a failing check.
       */
      await evaluate(cdp, `window.__probeJpeg = ${JSON.stringify(TINY_JPEG_BASE64)}; true`);

      const uploaded = await evaluate(
        cdp,
        `(() => {
          const binary = atob(window.__probeJpeg);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

          const file = new File([bytes], 'avatar.jpg', { type: 'image/jpeg' });
          const transfer = new DataTransfer();
          transfer.items.add(file);

          const input = document.querySelector('input[type="file"]');
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));

          return true;
        })()`
      );

      assert(uploaded, 'the file input could not be populated');

      // The <img> only appears once the user record carries an avatar path.
      await waitFor(cdp, `Boolean(document.querySelector('img[src*="/uploads/avatars/"]'))`, {
        timeout: 15000,
      });

      // Wait for the image to actually decode — a 404/HTML response still
      // produces an element, which is exactly how this bug hid.
      await waitFor(
        cdp,
        `(() => {
          const img = document.querySelector('img[src*="/uploads/avatars/"]');
          return img && img.complete && img.naturalWidth > 0;
        })()`,
        { timeout: 15000 }
      );

      const detail = await evaluate(
        cdp,
        `(() => {
          const img = document.querySelector('img[src*="/uploads/avatars/"]');
          return { src: img.getAttribute('src'), naturalWidth: img.naturalWidth };
        })()`
      );

      return `${detail.src} (${detail.naturalWidth}px wide)`;
    });

    await check('6', 'the avatar survives a reload', async () => {
      await cdp.send('Page.navigate', { url: `${APP}/workspaces/${ids.workspaceId}/settings` });
      await waitFor(
        cdp,
        `(() => {
          const img = document.querySelector('img[src*="/uploads/avatars/"]');
          return img && img.complete && img.naturalWidth > 0;
        })()`,
        { timeout: 15000 }
      );

      const src = await evaluate(
        cdp,
        `document.querySelector('img[src*="/uploads/avatars/"]').getAttribute('src')`
      );

      return src;
    });

    /* ---------------------------------------------------------- summary -- */

    const failed = results.filter((result) => result.status === 'FAIL');
    const passed = results.filter((result) => result.status === 'PASS');

    console.log(`\n===== ${passed.length} passed, ${failed.length} failed =====\n`);

    if (failed.length > 0) process.exitCode = 1;

    await cdp.close();
  } finally {
    if (!process.argv.includes('--headed')) {
      try {
        chrome.kill();
      } catch {
        /* already gone */
      }

      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* windows lock */
      }
    }
  }
};

main().catch((error) => {
  console.error('\nVerification harness failed:', error.message);
  process.exitCode = 1;
});
