/*
 * Boots the REAL backend so the frontend can be tested against it.
 *
 * WHY THIS EXISTS
 * ---------------
 * `node server.js` refuses to start unless it can reach MongoDB, and the
 * cluster in `server/.env` is unreachable from this machine (DNS for the Atlas
 * SRV record is refused — `querySrv ECONNREFUSED`). So the real server cannot
 * be run the normal way here.
 *
 * What this does instead: it starts the genuine `server/app.js` — the same
 * Express app, the same routes, controllers, validators, services, JWT signing
 * and cookie handling — but backed by the test suite's in-process data layer
 * (`server/tests/helpers/setup.js` -> `memoryStore.js`) rather than a real
 * database.
 *
 * WHAT THIS PROVES: the frontend drives the real API surface correctly — real
 *   status codes, real response envelopes, real `errors[]` field names, real
 *   cookie attributes, real 401/400/409 behaviour.
 * WHAT IT DOES NOT PROVE: index behaviour, query planning, driver-level
 *   casting, and transactions against a replica set. See the note at the top of
 *   `memoryStore.js`.
 *
 * It also sets `NODE_ENV=test` (via setup.js), which skips rate limiting —
 * exactly as the test suite does. So a 429 cannot be provoked through this
 * harness; the frontend's 429 copy is exercised against the limiter's
 * documented shape instead.
 *
 * NO BACKEND FILE IS MODIFIED. This only imports from `server/`.
 *
 *   node dev/boot-real-api.mjs            # listens on :5000
 */

import http from 'node:http';

import { startTestDatabase, getTestMode } from '../../server/tests/helpers/setup.js';
import { sentEmails, lastEmail, resetEmails } from '../../server/tests/helpers/emailTransport.js';

const PORT = Number(process.env.PORT ?? 5000);

const app = await startTestDatabase();

const server = app.listen(PORT, () => {
  console.log(`real-api listening on http://localhost:${PORT}`);
  console.log(`data layer: ${getTestMode() === 'mongodb' ? 'real MongoDB' : 'in-process store'}`);
  console.log('note: NODE_ENV=test, so rate limiting is bypassed.');
});

/*
 * Dev-only mailbox.
 *
 * `setup.js` replaces the email transport with the suite's recording fake, so
 * nothing leaves this machine — but the recorded messages are only reachable
 * from inside this process. A browser test cannot follow a password-reset link it
 * has no way to read, and the server stores only a digest, so the token genuinely
 * cannot be recovered from the database either.
 *
 * This second server exposes what was captured. It is bound to 127.0.0.1, it
 * lives in the dev harness rather than the application, and `server/app.js` has
 * no such route — the real API is untouched and this cannot ship.
 *
 * That distinction matters: an endpoint that returns password-reset tokens would
 * be a complete account-takeover primitive, which is exactly why it belongs to a
 * test harness and never to the product.
 *
 * Written on `node:http` rather than Express because this file lives under
 * `client/`, where `express` is not installed — and the server's copy is not
 * resolvable from here. Three routes do not need a framework.
 */
const MAILBOX_PORT = Number(process.env.MAILBOX_PORT ?? 5051);

const sendJson = (res, status, body) => {
  const payload = JSON.stringify(body, null, 2);

  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const mailboxServer = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://127.0.0.1');

  if (req.method === 'GET' && pathname === '/emails') {
    return sendJson(res, 200, { count: sentEmails().length, emails: sentEmails() });
  }

  if (req.method === 'GET' && pathname === '/emails/latest') {
    const email = lastEmail();

    if (!email) return sendJson(res, 404, { message: 'No email has been sent yet.' });

    return sendJson(res, 200, { email });
  }

  if (req.method === 'POST' && pathname === '/emails/reset') {
    resetEmails();

    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { message: 'Not found' });
});

mailboxServer.listen(MAILBOX_PORT, '127.0.0.1', () => {
  console.log(`dev mailbox listening on http://127.0.0.1:${MAILBOX_PORT} (harness only)`);
});

const shutdown = () => {
  mailboxServer.close();
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
