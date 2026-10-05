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

import { startTestDatabase, getTestMode } from '../../server/tests/helpers/setup.js';

const PORT = Number(process.env.PORT ?? 5000);

const app = await startTestDatabase();

const server = app.listen(PORT, () => {
  console.log(`real-api listening on http://localhost:${PORT}`);
  console.log(`data layer: ${getTestMode() === 'mongodb' ? 'real MongoDB' : 'in-process store'}`);
  console.log('note: NODE_ENV=test, so rate limiting is bypassed.');
});

const shutdown = () => server.close(() => process.exit(0));

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
