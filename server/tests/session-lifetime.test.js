/*
 * Session lifetime.
 *
 * These are the invariants behind "my session ended too soon". They are asserted
 * rather than assumed because every one of them is a silent failure: a cookie
 * that expires before its token, or a non-authentication error that tears the
 * session down, produces no log line and no error — just a user who has to sign
 * in again for no visible reason.
 *
 * `./helpers/setup.js` is imported first on purpose. It replaces the database
 * URI before anything reaches `src/config/env.js`; a file that imports the app
 * first dies at load with "Invalid environment configuration".
 */

import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  asUser,
  createUser,
  createWorkspace,
  DEFAULT_PASSWORD,
  uniqueEmail,
} from './helpers/factories.js';

let app;

before(async () => {
  app = await startTestDatabase();
});

after(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearDatabase();
});

const API = '/api/v1';

/** The `Max-Age` from a `Set-Cookie` header, in seconds. */
const maxAgeOf = (setCookie) => {
  const match = /Max-Age=(\d+)/i.exec(setCookie ?? '');

  return match ? Number(match[1]) : null;
};

/** The `accessToken` value from a `Set-Cookie` header. */
const tokenOf = (setCookie) => /accessToken=([^;]+)/.exec(setCookie ?? '')?.[1] ?? null;

describe('Session lifetime', () => {
  describe('cookie and token agree', () => {
    test('the cookie Max-Age matches the token lifetime exactly', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'Session User', email: uniqueEmail(), password: DEFAULT_PASSWORD });

      assert.equal(response.status, 201);

      const setCookie = response.headers['set-cookie']?.[0] ?? '';
      const cookieSeconds = maxAgeOf(setCookie);
      const token = tokenOf(setCookie);

      assert.ok(cookieSeconds, 'expected a Max-Age on the session cookie');
      assert.ok(token, 'expected an accessToken cookie');

      // Decode without verifying: the claim values are what is under test here,
      // and the signature is covered by the authentication suite.
      const claims = jwt.decode(token);

      assert.equal(
        claims.exp - claims.iat,
        cookieSeconds,
        'the cookie must not expire at a different time from the token it carries'
      );
    });

    test('env derives the cookie lifetime from the token lifetime', async () => {
      const { default: env, parseDurationMs } = await import('../src/config/env.js');

      const tokenLifetimeMs = parseDurationMs(env.jwtAccessExpiresIn);

      assert.ok(tokenLifetimeMs, 'JWT_ACCESS_EXPIRES_IN should be a parseable duration');
      assert.equal(
        env.cookieMaxAge,
        tokenLifetimeMs,
        'COOKIE_MAX_AGE and JWT_ACCESS_EXPIRES_IN must resolve to the same lifetime'
      );
    });

    test('parseDurationMs understands the jsonwebtoken forms', async () => {
      const { parseDurationMs } = await import('../src/config/env.js');

      assert.equal(parseDurationMs('15m'), 900_000);
      assert.equal(parseDurationMs('1h'), 3_600_000);
      assert.equal(parseDurationMs('900s'), 900_000);
      assert.equal(parseDurationMs('7d'), 604_800_000);
      assert.equal(parseDurationMs('250ms'), 250);
      // A bare number is seconds, matching jsonwebtoken.
      assert.equal(parseDurationMs('900'), 900_000);
      // Unparseable values are reported, not guessed at.
      assert.equal(parseDurationMs('soon'), null);
    });
  });

  describe('non-authentication errors do not end the session', () => {
    /*
     * The client tears the session down on a 401 and on nothing else. These two
     * tests pin the server half of that contract: a permission failure and a
     * validation failure must leave the session usable, so a 403 or a 400 can
     * never be mistaken for an expiry.
     */
    test('a 403 leaves the session usable', async () => {
      const owner = await createUser();
      const outsider = await createUser();
      const workspace = await createWorkspace(owner);

      const agent = asUser(app, outsider);

      const forbidden = await agent.get(`${API}/workspaces/${workspace._id}`);
      assert.equal(forbidden.status, 403);

      // The same cookie must still authenticate a request it is allowed to make.
      const stillValid = await agent.get(`${API}/users/profile`);
      assert.equal(stillValid.status, 200);
      assert.equal(stillValid.body.data.user.email, outsider.email);
    });

    test('a 400 leaves the session usable', async () => {
      const user = await createUser();
      const agent = asUser(app, user);

      // `name` has a two-character minimum, so this is a validation failure.
      const invalid = await agent.patch(`${API}/users/profile`).send({ name: 'x' });
      assert.equal(invalid.status, 400);

      const stillValid = await agent.get(`${API}/users/profile`);
      assert.equal(stillValid.status, 200);
    });
  });

  describe('genuine expiry', () => {
    test('an expired token is rejected as 401 and identifies the expiry', async () => {
      const user = await createUser();
      const env = (await import('../src/config/env.js')).default;

      const expired = jwt.sign({ userId: String(user._id) }, env.jwtAccessSecret, {
        expiresIn: '-10s',
      });

      const response = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', `accessToken=${expired}`);

      assert.equal(response.status, 401);
      // Not 403, and not a 5xx: the client needs to tell "sign in again" apart
      // from "you are not allowed" and from "the server is broken".
      assert.equal(response.body.message, 'Access token has expired');
    });
  });

  describe('login and logout', () => {
    test('login sets a cookie that authenticates the next request', async () => {
      const email = uniqueEmail();
      await createUser({ email });

      const login = await request(app).post(`${API}/auth/login`).send({
        email,
        password: DEFAULT_PASSWORD,
      });

      assert.equal(login.status, 200);

      const cookie = login.headers['set-cookie']?.[0] ?? '';
      const token = tokenOf(cookie);

      const profile = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', `accessToken=${token}`);

      assert.equal(profile.status, 200);
      assert.equal(profile.body.data.user.email, email);
    });

    test('logout clears the session cookie', async () => {
      const user = await createUser();
      const response = await asUser(app, user).post(`${API}/auth/logout`);

      assert.equal(response.status, 200);

      const cookie = response.headers['set-cookie']?.[0] ?? '';

      assert.match(cookie, /accessToken=;/, 'the cookie should be emptied');
      // An expiry in the past is what actually removes it from the browser.
      assert.match(cookie, /Expires=Thu, 01 Jan 1970/i);
    });
  });
});
