/*
 * End-to-end verification of the password-reset flow, and of registration
 * working with no email step.
 *
 * Drives real Chrome against the built app on :4173, which proxies to the real
 * `server/app.js` on :5000. The API is booted through `dev/boot-real-api.mjs`,
 * which installs the test suite's recording email transport — so nothing leaves
 * the machine, and the messages are readable from the harness mailbox on :5051.
 *
 * That mailbox is what makes this a real end-to-end test rather than a UI smoke
 * test. The reset token is only ever available inside the email, exactly as it is
 * for a user, and the server stores only a digest — so following the link proves
 * the whole chain works: the app mints a token, stores its digest, builds the URL
 * from `CLIENT_URL`, the browser opens it, and the API accepts it.
 *
 * Email **verification** was removed from the product; this file previously
 * covered it and no longer does. What remains is the reset flow, plus a check
 * that registration no longer depends on an email at all.
 *
 *   node dev/verify-password-reset.mjs
 *
 * Exit code is non-zero when any check fails.
 */

import { Cdp, evaluate, findChrome, mkdtempSync, rmSync, spawn, tmpdir, waitFor } from './cdp.mjs';

const APP = process.env.APP_URL ?? 'http://localhost:4173';
const MAILBOX = process.env.MAILBOX_URL ?? 'http://127.0.0.1:5051';

const USER = {
  name: 'Reset Flow Tester',
  email: `reset.flow.${Date.now()}@example.com`,
  password: 'Str0ngPass!234',
  newPassword: 'RotatedPass!567',
};

const results = [];

const record = (label, status, detail) => {
  results.push({ label, status, detail });
  console.log(`${status === 'PASS' ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const check = async (label, fn) => {
  try {
    const detail = await fn();
    record(label, 'PASS', typeof detail === 'string' ? detail : null);
  } catch (error) {
    record(label, 'FAIL', error.message);
  }
};

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

/* ------------------------------------------------------------- mailbox ---- */

const mailbox = async (path, method = 'GET') => {
  const response = await fetch(`${MAILBOX}${path}`, { method });

  assert(response.ok, `mailbox ${path} returned ${response.status}`);

  return response.json();
};

/** The most recent message. */
const latestEmail = async () => {
  const { email } = await mailbox('/emails/latest');

  assert(email, 'no email was recorded');

  return email;
};

const resetMailbox = () => mailbox('/emails/reset', 'POST');

const urlFrom = (email) => {
  const match = /https?:\/\/[^\s<>"')]+/.exec(email.text ?? '');

  assert(match, 'the message contained no URL');

  return match[0];
};

/* --------------------------------------------------------------- browser -- */

const setField = async (cdp, name, value) => {
  const ok = await evaluate(
    cdp,
    `(() => {
      const field = document.querySelector('input[name=${JSON.stringify(name)}]');
      if (!field) return false;

      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value');
      descriptor.set.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    })()`
  );

  assert(ok, `the "${name}" field was not found`);
};

/**
 * Fill a field by CSS selector.
 *
 * The auth forms pass `name` to `Input`, so `setField` works there. The dialogs
 * do not — `Input` derives its `id` from the label instead — so the workspace
 * dialog is addressed by its container. Selecting by selector rather than by
 * `name` keeps this honest about what the DOM actually contains.
 */
const setFieldBySelector = async (cdp, selector, value) => {
  const ok = await evaluate(
    cdp,
    `(() => {
      const field = document.querySelector(${JSON.stringify(selector)});
      if (!field) return false;

      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value');
      descriptor.set.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    })()`
  );

  assert(ok, `no field matched "${selector}"`);
};

const clickButton = async (cdp, label) => {
  const ok = await evaluate(
    cdp,
    `(() => {
      const button = [...document.querySelectorAll('button')].find(
        (el) => el.textContent.trim() === ${JSON.stringify(label)}
      );
      if (!button) return false;
      button.click();
      return true;
    })()`
  );

  assert(ok, `no button labelled "${label}"`);
};

const bodyText = (cdp) => evaluate(cdp, `document.body.innerText`);

const go = async (cdp, path) => {
  await cdp.send('Page.navigate', { url: `${APP}${path}` });
  await waitFor(cdp, `document.body && document.body.innerText.length > 0`, { timeout: 20000 });
};

/* ------------------------------------------------------------------ main -- */

const main = async () => {
  const profile = mkdtempSync(`${tmpdir()}/resetflow-`);
  const chrome = spawn(findChrome(), [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=9224',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
  ]);

  try {
    let version;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        version = await (await fetch('http://127.0.0.1:9224/json/version')).json();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    if (!version) fail('Chrome did not expose a debugging port.');

    const target = await (
      await fetch('http://127.0.0.1:9224/json/new?about:blank', { method: 'PUT' })
    ).json();

    const cdp = await new Cdp(target.webSocketDebuggerUrl).connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 900,
    });

    console.log(`\nChrome:  ${version.Browser}`);
    console.log(`App:     ${APP}`);
    console.log(`Mailbox: ${MAILBOX}\n`);

    await resetMailbox();

    /* ------------------------------------------- registration, no email --- */

    console.log('--- registration (no verification step) ---');

    await check('registering signs the user in and lands in the app', async () => {
      await go(cdp, '/register');

      await setField(cdp, 'name', USER.name);
      await setField(cdp, 'email', USER.email);
      await setField(cdp, 'password', USER.password);
      await clickButton(cdp, 'Create account');

      await waitFor(cdp, `location.pathname.startsWith('/workspaces')`, { timeout: 20000 });

      return `landed on ${await evaluate(cdp, `location.pathname`)}`;
    });

    await check('registration sends no email and asks for no confirmation', async () => {
      const { count } = await mailbox('/emails');

      assert(count === 0, `registration should send nothing, but ${count} message(s) were sent`);

      const text = await bodyText(cdp);

      assert(
        !/confirm your email|check your email/i.test(text),
        `the app should not ask for confirmation: ${text.slice(0, 160)}`
      );

      return null;
    });

    await check('a brand-new account can create a workspace immediately', async () => {
      const present = await evaluate(
        cdp,
        `[...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'New workspace')`
      );

      assert(present, 'the create-workspace button is not offered to a new account');

      await clickButton(cdp, 'New workspace');
      await waitFor(cdp, `document.querySelector('[role="dialog"] input')`, { timeout: 20000 });

      await setFieldBySelector(cdp, '[role="dialog"] input', 'Reset Flow Workspace');
      await clickButton(cdp, 'Create workspace');

      await waitFor(cdp, `document.body.innerText.includes('Reset Flow Workspace')`, {
        timeout: 20000,
      });

      return null;
    });

    await check('the old verification route no longer exists', async () => {
      await go(cdp, '/verify-email');

      await waitFor(cdp, `document.body.innerText.length > 0`, { timeout: 20000 });

      const text = await bodyText(cdp);

      assert(
        /not found|404|does not exist/i.test(text),
        `expected a not-found screen, got: ${text.slice(0, 160)}`
      );

      return null;
    });

    /* ------------------------------------------------------ password reset */

    console.log('\n--- password reset ---');

    // Signed out, because /forgot-password is behind RequireAnonymous.
    await cdp.send('Network.clearBrowserCookies');
    await resetMailbox();

    await check('the sign-in screen offers a way to recover the password', async () => {
      await go(cdp, '/login');
      await waitFor(cdp, `document.querySelector('input[name="email"]')`, { timeout: 20000 });

      const present = await evaluate(
        cdp,
        `[...document.querySelectorAll('a')].some((el) => el.textContent.trim() === 'Forgot your password?')`
      );

      assert(present, 'no forgot-password link on the sign-in screen');

      return null;
    });

    await check('requesting a reset says nothing about whether the account exists', async () => {
      await go(cdp, '/forgot-password');
      await waitFor(cdp, `document.querySelector('input[name="email"]')`, { timeout: 20000 });

      await setField(cdp, 'email', USER.email);
      await clickButton(cdp, 'Send reset link');

      await waitFor(cdp, `document.body.innerText.includes('Check your email')`, {
        timeout: 20000,
      });

      const text = await bodyText(cdp);

      assert(
        text.includes('If that address has an account'),
        `the confirmation does not hedge: ${text.slice(0, 200)}`
      );
      assert(
        !/does not exist|no account|not found/i.test(text),
        'the response implies the address is unknown'
      );

      return null;
    });

    await check('the reset email is sent to the right address', async () => {
      const email = await latestEmail();

      assert(email.to === USER.email, `the message went to ${email.to}`);
      assert(
        urlFrom(email).startsWith(`${APP}/reset-password?token=`),
        `the link did not point at the frontend: ${urlFrom(email)}`
      );

      return `link → ${new URL(urlFrom(email)).pathname}`;
    });

    await check('an unknown address gets the identical response', async () => {
      await go(cdp, '/forgot-password');
      await waitFor(cdp, `document.querySelector('input[name="email"]')`, { timeout: 20000 });

      await setField(cdp, 'email', `nobody.${Date.now()}@example.com`);
      await clickButton(cdp, 'Send reset link');

      await waitFor(cdp, `document.body.innerText.includes('Check your email')`, {
        timeout: 20000,
      });

      const text = await bodyText(cdp);

      assert(
        text.includes('If that address has an account'),
        'the unknown-address response differs from the known one'
      );

      return null;
    });

    await check('the emailed link opens the reset form', async () => {
      const email = await latestEmail();
      const link = urlFrom(email);

      await cdp.send('Page.navigate', { url: link });
      await waitFor(cdp, `document.querySelector('input[name="password"]')`, { timeout: 20000 });

      const heading = await bodyText(cdp);

      assert(
        heading.includes('Choose a new password'),
        `unexpected screen: ${heading.slice(0, 160)}`
      );

      return null;
    });

    await check('a mismatched confirmation is refused before it reaches the API', async () => {
      await setField(cdp, 'password', USER.newPassword);
      await setField(cdp, 'confirmPassword', 'something-else');
      await clickButton(cdp, 'Save new password');

      await waitFor(cdp, `document.body.innerText.includes('Passwords do not match')`, {
        timeout: 10000,
      });

      return null;
    });

    await check('a valid reset sets the new password', async () => {
      await setField(cdp, 'password', USER.newPassword);
      await setField(cdp, 'confirmPassword', USER.newPassword);
      await clickButton(cdp, 'Save new password');

      await waitFor(cdp, `document.body.innerText.includes('Password updated')`, {
        timeout: 20000,
      });

      return null;
    });

    await check('the new password signs in and the old one does not', async () => {
      await go(cdp, '/login');
      await waitFor(cdp, `document.querySelector('input[name="email"]')`, { timeout: 20000 });

      // The old password must be refused.
      await setField(cdp, 'email', USER.email);
      await setField(cdp, 'password', USER.password);
      await clickButton(cdp, 'Sign in');

      await waitFor(cdp, `document.body.innerText.includes('do not match an account')`, {
        timeout: 20000,
      });

      // The new one must work.
      await setField(cdp, 'password', USER.newPassword);
      await clickButton(cdp, 'Sign in');

      await waitFor(cdp, `location.pathname.startsWith('/workspaces')`, { timeout: 20000 });

      return `landed on ${await evaluate(cdp, `location.pathname`)}`;
    });

    await check('a reused reset link is refused', async () => {
      await cdp.send('Network.clearBrowserCookies');

      const email = await latestEmail();
      const link = urlFrom(email);

      await cdp.send('Page.navigate', { url: link });
      await waitFor(cdp, `document.querySelector('input[name="password"]')`, { timeout: 20000 });

      await setField(cdp, 'password', 'AnotherPass!789');
      await setField(cdp, 'confirmPassword', 'AnotherPass!789');
      await clickButton(cdp, 'Save new password');

      await waitFor(cdp, `document.body.innerText.includes('That link did not work')`, {
        timeout: 20000,
      });

      return null;
    });

    await check('a reset link with no token explains itself', async () => {
      await go(cdp, '/reset-password');
      await waitFor(cdp, `document.body.innerText.includes('This link is incomplete')`, {
        timeout: 20000,
      });

      return null;
    });

    /* ------------------------------------------------------------ summary */

    const failed = results.filter((result) => result.status === 'FAIL');
    const passed = results.filter((result) => result.status === 'PASS');

    console.log(`\n===== ${passed.length} passed, ${failed.length} failed =====\n`);

    if (failed.length > 0) process.exitCode = 1;

    await cdp.close();
  } finally {
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
};

main().catch((error) => {
  console.error('\nVerification harness failed:', error.message);
  process.exitCode = 1;
});
