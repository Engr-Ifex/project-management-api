import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

/*
 * Imported for its side effect only: it sets the test environment variables
 * that `src/config/env.js` reads once, at import time. `errorHandler` below
 * pulls that module in, so without this the file fails to load. No database
 * connection is opened — the limiter is mounted on a throwaway app.
 */
import './helpers/setup.js';

import { createRateLimiter } from '../src/middlewares/rateLimit.middleware.js';
import { AUTH_RATE_LIMIT } from '../src/constants/security.js';
import errorHandler from '../src/middlewares/error.middleware.js';

/*
 * Rate limiting.
 *
 * `app.js` and `auth.routes.js` both state that "the limiter itself is covered
 * by dedicated tests that mount their own instance" — this is that file. The
 * production limiter is skipped under NODE_ENV=test (every request in the suite
 * comes from one address), so the only way to exercise it is to mount a fresh
 * instance on a throwaway app, which is what every test below does.
 *
 * Covered: the request budget, the 429 response and its envelope, the
 * RateLimit-* headers, window expiry, per-key isolation, the manual reset, the
 * option validation, and the fact that the credential budget is the strict one.
 */

/** A throwaway app with a limiter in front of a trivial 200 route. */
const buildApp = (options = {}) => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, ...options });

  const app = express();

  app.use(limiter);
  app.get('/ping', (req, res) => res.status(200).json({ ok: true }));
  app.use(errorHandler);

  return { app, limiter };
};

describe('rate limiter', () => {
  test('allows requests up to the limit and rejects the next one', async () => {
    const { app } = buildApp({ max: 3 });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await request(app).get('/ping');

      assert.equal(response.status, 200, `request ${attempt} must be allowed`);
    }

    const blocked = await request(app).get('/ping');

    assert.equal(blocked.status, 429, 'the request past the limit must be rejected');
  });

  test('a 429 uses the standard error envelope and the configured message', async () => {
    const { app } = buildApp({ max: 1, message: 'Slow down.' });

    await request(app).get('/ping');
    const blocked = await request(app).get('/ping');

    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.success, false);
    assert.equal(blocked.body.statusCode, 429);
    assert.equal(blocked.body.message, 'Slow down.');
    assert.ok(Array.isArray(blocked.body.errors));
  });

  test('advertises the budget through the RateLimit headers', async () => {
    const { app } = buildApp({ max: 5 });

    const first = await request(app).get('/ping');

    assert.equal(first.headers['ratelimit-limit'], '5');
    assert.equal(first.headers['ratelimit-remaining'], '4');
    assert.ok(Number(first.headers['ratelimit-reset']) >= 1);
  });

  test('sets Retry-After when a request is rejected', async () => {
    const { app } = buildApp({ max: 1 });

    await request(app).get('/ping');
    const blocked = await request(app).get('/ping');

    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers['retry-after']) >= 1);
  });

  test('the budget refills once the window elapses', async () => {
    const { app } = buildApp({ max: 1, windowMs: 60 });

    assert.equal((await request(app).get('/ping')).status, 200);
    assert.equal((await request(app).get('/ping')).status, 429);

    await new Promise((resolve) => setTimeout(resolve, 90));

    assert.equal(
      (await request(app).get('/ping')).status,
      200,
      'a new window must restore the budget'
    );
  });

  test('keys are independent, so one caller cannot exhaust another\u2019s budget', async () => {
    /*
     * `keyGenerator` is exercised directly with a header-driven key rather than
     * relying on `req.ip`, which supertest cannot vary.
     */
    const { app } = buildApp({
      max: 1,
      keyGenerator: (req) => req.headers['x-client'] ?? 'anonymous',
    });

    assert.equal((await request(app).get('/ping').set('x-client', 'a')).status, 200);
    assert.equal((await request(app).get('/ping').set('x-client', 'a')).status, 429);

    assert.equal(
      (await request(app).get('/ping').set('x-client', 'b')).status,
      200,
      'a different key must have its own untouched budget'
    );
  });

  test('reset() clears every counter', async () => {
    const { app, limiter } = buildApp({ max: 1 });

    await request(app).get('/ping');
    assert.equal((await request(app).get('/ping')).status, 429);

    limiter.reset();

    assert.equal((await request(app).get('/ping')).status, 200);
  });

  test('rejects an invalid window or limit at construction time', () => {
    assert.throws(() => createRateLimiter({ windowMs: 0, max: 10 }), /windowMs/);
    assert.throws(() => createRateLimiter({ windowMs: -1, max: 10 }), /windowMs/);
    assert.throws(() => createRateLimiter({ windowMs: 1000, max: 0 }), /max/);
    assert.throws(() => createRateLimiter({ windowMs: 1000, max: -5 }), /max/);
  });

  test('the credential budget is stricter than a general one', () => {
    /*
     * The point of a separate auth limiter is that guessing a password is far
     * more expensive than calling a read endpoint. If this ever became looser
     * than the broad limit, the control would be pointless — so it is pinned.
     */
    assert.equal(AUTH_RATE_LIMIT.max, 10);
    assert.equal(AUTH_RATE_LIMIT.windowMs, 15 * 60 * 1000);
    assert.match(AUTH_RATE_LIMIT.message, /too many authentication attempts/i);
  });
});
