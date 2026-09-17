import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import { createUser, uniqueEmail, asUser, DEFAULT_PASSWORD } from './helpers/factories.js';

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

describe('Authentication', () => {
  describe('registration', () => {
    test('creates an account and sets an httpOnly session cookie', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'New User', email: uniqueEmail(), password: DEFAULT_PASSWORD });

      assert.equal(response.status, 201);
      assert.equal(response.body.success, true);
      assert.ok(response.body.data.user.id);

      const cookie = response.headers['set-cookie']?.[0] ?? '';
      assert.match(cookie, /accessToken=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Strict/i);
    });

    test('never returns the password or its hash', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'New User', email: uniqueEmail(), password: DEFAULT_PASSWORD });

      const serialized = JSON.stringify(response.body);
      assert.equal(response.body.data.user.password, undefined);
      assert.ok(!serialized.includes('$2b$'));
      assert.ok(!serialized.includes(DEFAULT_PASSWORD));
    });

    test('rejects a duplicate email', async () => {
      const email = uniqueEmail();
      await createUser({ email });

      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'Other', email, password: DEFAULT_PASSWORD });

      assert.equal(response.status, 409);
    });

    test('rejects an invalid email', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'New User', email: 'not-an-email', password: DEFAULT_PASSWORD });

      assert.equal(response.status, 400);
    });

    test('rejects a short password', async () => {
      const response = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'New User', email: uniqueEmail(), password: 'short' });

      assert.equal(response.status, 400);
    });

    test('stores the password as a bcrypt hash', async () => {
      const email = uniqueEmail();
      await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'New User', email, password: DEFAULT_PASSWORD });

      const stored = await import('../src/models/User.js').then((m) =>
        m.default.findOne({ email }).select('+password')
      );

      assert.match(stored.password, /^\$2[aby]\$\d{2}\$/);
      assert.notEqual(stored.password, DEFAULT_PASSWORD);
    });
  });

  describe('login', () => {
    test('succeeds with valid credentials', async () => {
      const email = uniqueEmail();
      await createUser({ email });

      const response = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password: DEFAULT_PASSWORD });

      assert.equal(response.status, 200);
      assert.match(response.headers['set-cookie']?.[0] ?? '', /accessToken=/);
    });

    test('rejects a wrong password with 401', async () => {
      const email = uniqueEmail();
      await createUser({ email });

      const response = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password: 'WrongPassword1!' });

      assert.equal(response.status, 401);
    });

    test('gives an identical response for an unknown email (no enumeration)', async () => {
      const email = uniqueEmail();
      await createUser({ email });

      const wrongPassword = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password: 'WrongPassword1!' });

      const unknownEmail = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'definitely-not-registered@test.local', password: 'WrongPassword1!' });

      assert.equal(wrongPassword.status, unknownEmail.status);
      assert.equal(wrongPassword.body.message, unknownEmail.body.message);
      assert.equal(wrongPassword.body.message, 'Invalid email or password');
    });

    test('rejects a soft-deleted account', async () => {
      const email = uniqueEmail();
      const user = await createUser({ email });
      user.isDeleted = true;
      await user.save();

      const response = await request(app)
        .post(`${API}/auth/login`)
        .send({ email, password: DEFAULT_PASSWORD });

      assert.equal(response.status, 401);
    });
  });

  describe('logout', () => {
    test('clears the session cookie', async () => {
      const user = await createUser();
      const client = asUser(app, user);

      const response = await client.post(`${API}/auth/logout`);

      assert.equal(response.status, 200);
      assert.match(response.headers['set-cookie']?.[0] ?? '', /accessToken=;/);
    });

    test('requires authentication', async () => {
      const response = await request(app).post(`${API}/auth/logout`);

      assert.equal(response.status, 401);
    });
  });

  describe('protected routes', () => {
    test('reject a request with no cookie', async () => {
      const response = await request(app).get(`${API}/users/profile`);

      assert.equal(response.status, 401);
    });

    test('accept a valid token', async () => {
      const user = await createUser();
      const response = await asUser(app, user).get(`${API}/users/profile`);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.user.id, String(user._id));
    });

    test('reject a malformed token', async () => {
      const response = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', 'accessToken=not.a.jwt');

      assert.equal(response.status, 401);
    });

    test('reject a token signed with the wrong secret', async () => {
      const user = await createUser();
      const forged = jwt.sign({ userId: String(user._id) }, 'a-different-secret-entirely-32chars');

      const response = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', `accessToken=${forged}`);

      assert.equal(response.status, 401);
    });

    test('reject an expired token with 401 (not 500)', async () => {
      const user = await createUser();
      const env = (await import('../src/config/env.js')).default;
      const expired = jwt.sign({ userId: String(user._id) }, env.jwtAccessSecret, {
        expiresIn: '-10s',
      });

      const response = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', `accessToken=${expired}`);

      assert.equal(response.status, 401);
      assert.equal(response.body.message, 'Access token has expired');
    });

    test('reject an alg:none token', async () => {
      const user = await createUser();
      const noneToken = jwt.sign({ userId: String(user._id) }, '', { algorithm: 'none' });

      const response = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', `accessToken=${noneToken}`);

      assert.equal(response.status, 401);
    });

    test('reject a token for a user that no longer exists', async () => {
      const user = await createUser();
      const token = user.generateAccessToken();
      await user.deleteOne();

      const response = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', `accessToken=${token}`);

      assert.equal(response.status, 401);
    });
  });

  describe('token invalidation on password change', () => {
    test('a token issued before the change is rejected', async () => {
      const user = await createUser();
      const oldToken = user.generateAccessToken();

      user.password = 'BrandNewPassword1!';
      await user.save();

      /*
       * Push the recorded change time clearly past the token's issued-at.
       * `iat` is whole seconds and the middleware allows a one-second
       * tolerance, so the change has to be further back than that to represent
       * a session that genuinely predates it.
       */
      user.passwordChangedAt = new Date(Date.now() + 10_000);
      await user.save({ validateBeforeSave: false });

      const response = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', `accessToken=${oldToken}`);

      assert.equal(response.status, 401);
      assert.match(response.body.message, /log in again/);
    });

    test('a token issued after the change still works', async () => {
      const user = await createUser();
      user.password = 'BrandNewPassword1!';
      await user.save();

      const fresh = user.generateAccessToken();
      const response = await request(app)
        .get(`${API}/users/profile`)
        .set('Cookie', `accessToken=${fresh}`);

      assert.equal(response.status, 200);
    });
  });

  describe('password change endpoint', () => {
    test('changes the password when the current one is correct', async () => {
      const user = await createUser();
      const client = asUser(app, user);

      const response = await client.patch(`${API}/users/change-password`).send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: 'BrandNewPassword1!',
        confirmPassword: 'BrandNewPassword1!',
      });

      assert.equal(response.status, 200);

      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: 'BrandNewPassword1!' });

      assert.equal(login.status, 200);
    });

    test('rejects an incorrect current password', async () => {
      const user = await createUser();
      const client = asUser(app, user);

      const response = await client.patch(`${API}/users/change-password`).send({
        currentPassword: 'WrongCurrent1!',
        newPassword: 'BrandNewPassword1!',
        confirmPassword: 'BrandNewPassword1!',
      });

      assert.equal(response.status, 401);
    });

    test('rejects a mismatched confirmation', async () => {
      const user = await createUser();
      const client = asUser(app, user);

      const response = await client.patch(`${API}/users/change-password`).send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: 'BrandNewPassword1!',
        confirmPassword: 'Different1!',
      });

      assert.equal(response.status, 400);
    });
  });
});
