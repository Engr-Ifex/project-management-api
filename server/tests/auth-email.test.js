import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import request from 'supertest';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import { createUser, createWorkspace, uniqueEmail, DEFAULT_PASSWORD } from './helpers/factories.js';
import {
  failSends,
  lastEmail,
  sentEmails,
  tokenFromEmail,
  urlFromEmail,
  uninstallEmailTransport,
  installEmailTransport,
} from './helpers/emailTransport.js';

import { createAuthRouter } from '../src/routes/auth.routes.js';
import errorHandler from '../src/middlewares/error.middleware.js';
import { hashEmailToken, generateEmailToken } from '../src/utils/emailTokens.js';
import {
  EMAIL_SEND_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '../src/constants/security.js';

/*
 * Authentication email, and the account lifecycle around it.
 *
 * Email verification was **removed**: registration no longer sends anything, and
 * an account is fully usable the moment it is created. What is left of the email
 * layer is the password-reset flow, and that is what most of this file covers.
 *
 * The removal is asserted rather than assumed. The first two blocks check that
 * registration produces a working account with no email and no verification
 * state, and that a document still carrying the fields the previous version
 * wrote — which is what a real existing database looks like — is unaffected.
 *
 * Resend is never contacted. `tests/helpers/setup.js` installs the recording
 * fake in `tests/helpers/emailTransport.js` before the app is imported, so every
 * assertion reads a message the application *handed to the provider*, and the
 * reset link is reconstructed from that message rather than from anything the
 * test knows independently.
 */

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

const NEW_PASSWORD = 'Br4ndNewPassword!';
const OTHER_PASSWORD = 'An0therPassword!';

/** Loads the User model lazily so the DB connection is established first. */
const User = async () => (await import('../src/models/User.js')).default;

/*
 * The API returns ids as strings; the raw driver needs an ObjectId. Going
 * through the raw collection is deliberate — `passwordResetToken.hash` is
 * `select: false`, and reading it through the schema would return `undefined`
 * and quietly turn "the digest is cleared" into a test that passes for the wrong
 * reason.
 */
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/* ------------------------------------------------------------------ helpers */

/** Register through the real endpoint. */
const register = async ({
  name = 'New User',
  email = uniqueEmail(),
  password = DEFAULT_PASSWORD,
} = {}) => {
  const response = await request(app).post(`${API}/auth/register`).send({ name, email, password });

  return {
    response,
    email,
    password,
    cookie: (response.headers['set-cookie']?.[0] ?? '').split(';')[0],
  };
};

/** An authenticated supertest call carrying a real session cookie. */
const asCookie = (cookie) => {
  const withCookie = (test) => test.set('Cookie', cookie);

  return {
    get: (url) => withCookie(request(app).get(url)),
    post: (url) => withCookie(request(app).post(url)),
    patch: (url) => withCookie(request(app).patch(url)),
  };
};

/** Force a stored reset token's expiry into the past. */
const expirePasswordResetToken = async (userId) => {
  const Model = await User();

  await Model.collection.updateOne(
    { _id: toObjectId(userId) },
    { $set: { 'passwordResetToken.expiresAt': new Date(Date.now() - 60_000) } }
  );
};

/** Read the stored reset token digest straight from the collection. */
const storedTokens = async (userId) => {
  const Model = await User();

  return Model.collection.findOne(
    { _id: toObjectId(userId) },
    { projection: { passwordResetToken: 1 } }
  );
};

/** Request a reset and return the raw token recovered from the email. */
const startReset = async (user) => {
  await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });

  return tokenFromEmail(lastEmail());
};

/* ===================================================================== tests */

describe('Registration without email verification', () => {
  test('creates an account and signs it in', async () => {
    const { response } = await register();

    assert.equal(response.status, 201);
    assert.ok(response.body.data.user.id, 'the response should carry the user');
    assert.ok(response.body.data.user.email);
  });

  test('sends no email at all', async () => {
    await register();

    assert.equal(
      sentEmails().length,
      0,
      'registration must not depend on a mail provider being configured'
    );
  });

  test('reports no verification state', async () => {
    const { response } = await register();

    const user = response.body.data.user;

    assert.equal('isVerified' in user, false, 'isVerified should be gone from the payload');
    assert.equal('verificationEmailSentAt' in user, false);
    assert.equal('verificationEmailSent' in response.body.data, false);
  });

  test('the new account can create a workspace immediately', async () => {
    /*
     * The behaviour this whole change exists to restore. Previously a fresh
     * account was unverified and this returned 403 until an emailed link was
     * opened — unusable on a deployment with no verified sending domain.
     */
    const { cookie } = await register();

    const response = await asCookie(cookie)
      .post(`${API}/workspaces`)
      .send({ name: 'First Workspace' });

    assert.equal(response.status, 201);
  });

  test('the new account can accept an invitation immediately', async () => {
    const owner = await createUser({ name: 'Owner' });
    const workspace = await createWorkspace(owner);

    const { cookie, email } = await register();

    const invite = await asCookie(`accessToken=${owner.generateAccessToken()}`)
      .post(`${API}/workspaces/${workspace._id}/invitations`)
      .send({ email, role: 'member' });

    assert.equal(invite.status, 201);

    const accepted = await asCookie(cookie).patch(
      `${API}/invitations/${invite.body.data.invitation.token}/accept`
    );

    assert.equal(accepted.status, 200);
  });

  test('the password is still hashed', async () => {
    const Model = await User();
    const { response } = await register();

    const stored = await Model.findById(response.body.data.user.id).select('+password');

    assert.notEqual(stored.password, DEFAULT_PASSWORD);
    assert.match(stored.password, /^\$2[aby]\$/, 'it should still be a bcrypt hash');
    assert.equal(await stored.comparePassword(DEFAULT_PASSWORD), true);
  });

  test('login works straight after registration', async () => {
    const { email, password } = await register();

    const login = await request(app).post(`${API}/auth/login`).send({ email, password });

    assert.equal(login.status, 200);
  });

  test('the model no longer declares the verification fields', async () => {
    const Model = await User();

    assert.equal(Model.schema.path('isVerified'), undefined);
    assert.equal(Model.schema.path('verificationToken'), undefined);

    // The reset flow must survive the removal.
    assert.ok(Model.schema.path('passwordResetToken.hash'), 'the reset token should remain');
  });

  test('the verification endpoints are gone', async () => {
    const verify = await request(app)
      .post(`${API}/auth/verify-email`)
      .send({ token: generateEmailToken() });

    const resend = await request(app).post(`${API}/auth/resend-verification`);

    assert.equal(verify.status, 404, 'POST /auth/verify-email should no longer exist');
    assert.equal(resend.status, 404, 'POST /auth/resend-verification should no longer exist');
  });

  test('the remaining auth endpoints are untouched', async () => {
    const { cookie } = await register();

    const logout = await asCookie(cookie).post(`${API}/auth/logout`);
    const profile = await asCookie(cookie).get(`${API}/users/profile`);

    assert.equal(logout.status, 200);
    assert.equal(profile.status, 200);
  });
});

describe('Compatibility with existing accounts', () => {
  /*
   * A real database upgraded across this change still contains documents written
   * by the previous version: an `isVerified` flag, and possibly a
   * `verificationToken` subdocument with a live digest.
   *
   * Mongoose ignores paths the schema no longer declares, so this data is inert.
   * The tests below write exactly that data and prove it cannot affect a login, a
   * workspace creation, or the API response — the "existing users can still log
   * in" requirement, asserted against the real shape rather than a guess at it.
   */
  const writeLegacyVerificationData = async (userId, { isVerified = false } = {}) => {
    const Model = await User();

    await Model.collection.updateOne(
      { _id: toObjectId(userId) },
      {
        $set: {
          isVerified,
          verificationToken: {
            hash: hashEmailToken(generateEmailToken()),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            sentAt: new Date(),
          },
        },
      }
    );
  };

  test('an account left marked unverified can still log in', async () => {
    const user = await createUser({ name: 'Legacy User' });

    await writeLegacyVerificationData(user._id, { isVerified: false });

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    assert.equal(login.status, 200, 'a stale isVerified flag must not lock an account out');
  });

  test('an account left marked unverified can still create a workspace', async () => {
    const user = await createUser({ name: 'Legacy Owner' });

    await writeLegacyVerificationData(user._id, { isVerified: false });

    const response = await asCookie(`accessToken=${user.generateAccessToken()}`)
      .post(`${API}/workspaces`)
      .send({ name: 'Legacy Workspace' });

    assert.equal(response.status, 201);
  });

  test('a leftover verification token does not appear in any response', async () => {
    const user = await createUser({ name: 'Legacy User' });

    await writeLegacyVerificationData(user._id, { isVerified: false });

    const response = await asCookie(`accessToken=${user.generateAccessToken()}`).get(
      `${API}/users/profile`
    );

    assert.equal(response.status, 200);

    const payload = JSON.stringify(response.body);

    assert.equal(payload.includes('verificationToken'), false);
    assert.equal(payload.includes('isVerified'), false);
  });

  test('a leftover verification token cannot be spent', async () => {
    const user = await createUser({ name: 'Legacy User' });

    await writeLegacyVerificationData(user._id, { isVerified: false });

    // The endpoint is gone entirely, so there is nothing to present it to.
    const response = await request(app)
      .post(`${API}/auth/verify-email`)
      .send({ token: generateEmailToken() });

    assert.equal(response.status, 404);
  });

  test('the password-reset flow is unaffected by leftover verification data', async () => {
    const user = await createUser({ name: 'Legacy User' });

    await writeLegacyVerificationData(user._id, { isVerified: false });

    const token = await startReset(user);

    assert.ok(token, 'a reset link should still be issued');

    const reset = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, password: NEW_PASSWORD });

    assert.equal(reset.status, 200);
  });
});

describe('Password reset', () => {
  describe('requesting', () => {
    test('does not disclose whether an address has an account', async () => {
      const user = await createUser({ name: 'Known', email: uniqueEmail() });

      const known = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: user.email });

      const unknown = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: uniqueEmail() });

      assert.equal(known.status, 200);
      assert.equal(unknown.status, 200);

      /*
       * Identical status *and* identical body. Comparing the whole payload rather
       * than the message alone means a field added later — a `sent` flag, an
       * `exists` boolean — fails this test instead of silently becoming the
       * oracle it was written to prevent.
       */
      assert.deepEqual(known.body, unknown.body);
      assert.deepEqual(known.body.data, unknown.body.data);
    });

    test('a provider failure is indistinguishable from success to the caller', async () => {
      const user = await createUser({ name: 'Known', email: uniqueEmail() });

      failSends({ error: { name: 'validation_error', statusCode: 403, message: 'nope' } });

      const failed = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: user.email });

      const unknown = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: uniqueEmail() });

      assert.equal(failed.status, 200);
      assert.deepEqual(failed.body, unknown.body);
    });

    test('sends the reset link to a known address, pointing at the frontend', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });

      await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });

      assert.equal(sentEmails().length, 1);

      const message = lastEmail();

      assert.equal(message.to, user.email);

      const url = urlFromEmail(message);

      assert.ok(url.startsWith('http://localhost:5173/reset-password?token='), `unexpected ${url}`);
    });

    test('sends nothing for an unknown address', async () => {
      await request(app).post(`${API}/auth/forgot-password`).send({ email: uniqueEmail() });

      assert.equal(sentEmails().length, 0);
    });

    test('does not change the password', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });

      await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });

      // The original credentials must still work — nothing has been reset yet.
      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: DEFAULT_PASSWORD });

      assert.equal(login.status, 200);
    });

    test('stores only a hash of the reset token', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });

      await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });

      const raw = tokenFromEmail(lastEmail());
      const stored = await storedTokens(user._id);

      assert.equal(stored.passwordResetToken.hash, hashEmailToken(raw));
      assert.ok(!JSON.stringify(stored).includes(raw));
    });

    test('a malformed address is a validation error', async () => {
      const response = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'not-an-address' });

      assert.equal(response.status, 400);
      assert.equal(response.body.errors[0].field, 'body.email');
    });

    test('a soft-deleted account receives nothing', async () => {
      const user = await createUser({ name: 'Gone', email: uniqueEmail() });

      user.isDeleted = true;
      await user.save();

      const response = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: user.email });

      assert.equal(response.status, 200, 'still a generic response');
      assert.equal(sentEmails().length, 0, 'a deleted account must not be mailable');
    });
  });

  describe('completing', () => {
    test('a valid token sets the new password and login succeeds with it', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });
      const token = await startReset(user);

      assert.ok(token, 'the reset email should contain a token');

      const reset = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ token, password: NEW_PASSWORD });

      assert.equal(reset.status, 200);

      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: NEW_PASSWORD });

      assert.equal(login.status, 200, 'the new password must work');

      const withOld = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: DEFAULT_PASSWORD });

      assert.equal(withOld.status, 401, 'the old password must stop working');
    });

    test('the new password is hashed, not stored in plaintext', async () => {
      const Model = await User();
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });
      const token = await startReset(user);

      await request(app).post(`${API}/auth/reset-password`).send({ token, password: NEW_PASSWORD });

      const reloaded = await Model.findById(user._id).select('+password');

      assert.notEqual(reloaded.password, NEW_PASSWORD, 'the plaintext must never be stored');
      assert.match(reloaded.password, /^\$2[aby]\$/, 'it should be a bcrypt hash');
      assert.equal(await reloaded.comparePassword(NEW_PASSWORD), true);
    });

    test('existing sessions are revoked', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });

      // A session that exists *before* the reset.
      const oldSession = `accessToken=${user.generateAccessToken()}`;

      const before = await asCookie(oldSession).get(`${API}/users/profile`);
      assert.equal(before.status, 200);

      /*
       * Wait out the token's one-second resolution before resetting.
       *
       * Revocation compares the token's `iat` — recorded in whole seconds —
       * against `passwordChangedAt`, with a deliberate one-second tolerance so a
       * token minted in the same second as a password change is not falsely
       * rejected. Resetting immediately would therefore leave the old token
       * valid for a reason that is correct behaviour, not a bug, and the test
       * would be asserting the tolerance rather than the revocation.
       */
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const token = await startReset(user);

      await request(app).post(`${API}/auth/reset-password`).send({ token, password: NEW_PASSWORD });

      /*
       * Revocation works through the mechanism the application already had: the
       * password change stamps `passwordChangedAt`, and the authentication
       * middleware rejects any token issued before it. No new revocation system
       * was added for this.
       */
      const after = await asCookie(oldSession).get(`${API}/users/profile`);

      assert.equal(after.status, 401, 'a pre-reset session must no longer authenticate');

      // And the reset really is what stamped it.
      const Model = await User();
      const reloaded = await Model.findById(user._id);

      assert.ok(reloaded.passwordChangedAt, 'the reset should stamp passwordChangedAt');
    });

    test('the token is invalidated on success', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });
      const token = await startReset(user);

      await request(app).post(`${API}/auth/reset-password`).send({ token, password: NEW_PASSWORD });

      const stored = await storedTokens(user._id);

      assert.equal(stored.passwordResetToken.hash, null);
    });

    test('a reused token is rejected and does not change the password again', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });
      const token = await startReset(user);

      const first = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ token, password: NEW_PASSWORD });
      assert.equal(first.status, 200);

      const second = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ token, password: OTHER_PASSWORD });

      assert.equal(second.status, 400);

      // The second attempt must not have taken effect.
      const withSecond = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: OTHER_PASSWORD });

      assert.equal(withSecond.status, 401);

      const withFirst = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: NEW_PASSWORD });

      assert.equal(withFirst.status, 200);
    });

    test('an expired token is rejected', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });
      const token = await startReset(user);

      await expirePasswordResetToken(user._id);

      const response = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ token, password: NEW_PASSWORD });

      assert.equal(response.status, 400);
      assert.match(response.body.message, /expired/i);

      const withOld = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: user.email, password: DEFAULT_PASSWORD });

      assert.equal(withOld.status, 200, 'the password must be untouched');
    });

    test('an unknown token is rejected', async () => {
      const response = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ token: generateEmailToken(), password: NEW_PASSWORD });

      assert.equal(response.status, 400);
      assert.match(response.body.message, /invalid or has already been used/i);
    });

    test('a password below the minimum length is rejected', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });
      const token = await startReset(user);

      const response = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ token, password: 'short' });

      assert.equal(response.status, 400);
      assert.equal(response.body.errors[0].field, 'body.password');

      // The token must not have been spent by a rejected attempt.
      const retry = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ token, password: NEW_PASSWORD });

      assert.equal(retry.status, 200, 'a validation failure must not consume the token');
    });

    test('a missing token or password is a validation error', async () => {
      const noToken = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ password: NEW_PASSWORD });

      assert.equal(noToken.status, 400);

      const noPassword = await request(app)
        .post(`${API}/auth/reset-password`)
        .send({ token: generateEmailToken() });

      assert.equal(noPassword.status, 400);
    });

    test('one account’s token cannot reset another account', async () => {
      const first = await createUser({ name: 'First', email: uniqueEmail() });
      const second = await createUser({ name: 'Second', email: uniqueEmail() });

      const token = await startReset(first);

      await request(app).post(`${API}/auth/reset-password`).send({ token, password: NEW_PASSWORD });

      const secondStillWorks = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: second.email, password: DEFAULT_PASSWORD });

      assert.equal(secondStillWorks.status, 200);
    });
  });

  describe('token lifetime', () => {
    test('a reset token is issued with the configured lifetime', async () => {
      const user = await createUser({ name: 'Ada', email: uniqueEmail() });

      await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });

      const stored = await storedTokens(user._id);

      const remaining = stored.passwordResetToken.expiresAt.getTime() - Date.now();

      assert.ok(
        Math.abs(remaining - PASSWORD_RESET_TOKEN_TTL_MS) < 30_000,
        `expected ~${PASSWORD_RESET_TOKEN_TTL_MS}ms, got ${remaining}ms`
      );
    });
  });
});

describe('Email configuration', () => {
  test('sending without a transport or credentials fails loudly', async () => {
    uninstallEmailTransport();

    try {
      const { sendEmail } = await import('../src/services/email.service.js');

      await assert.rejects(
        () =>
          sendEmail({
            to: 'someone@example.com',
            subject: 'Test',
            text: 'Hello',
          }),
        (error) => {
          assert.equal(error.statusCode, 503);
          assert.match(error.message, /not configured/i);

          return true;
        }
      );
    } finally {
      installEmailTransport();
    }
  });

  test('the service refuses an incomplete message', async () => {
    const { sendEmail } = await import('../src/services/email.service.js');

    await assert.rejects(() => sendEmail({ subject: 'No recipient', text: 'x' }));
    await assert.rejects(() => sendEmail({ to: 'a@b.test', text: 'x' }));
    await assert.rejects(() => sendEmail({ to: 'a@b.test', subject: 'x' }));
  });

  test('a masked address keeps the domain and hides the local part', async () => {
    const { maskEmail } = await import('../src/services/email.service.js');

    assert.equal(maskEmail('ada.lovelace@example.com'), 'a***@example.com');
    assert.equal(maskEmail('not-an-email'), '[invalid]');
    assert.equal(maskEmail(undefined), '[invalid]');
  });
});

describe('Rate limiting on email endpoints', () => {
  /*
   * The production limiters are bypassed under NODE_ENV=test, so a test that used
   * the shared app would prove nothing. `createAuthRouter` is imported with
   * `skipRateLimit: false` and mounted on a throwaway app, which exercises the
   * **real** routes with the **real** limiters — the wiring, not just the
   * limiter.
   */
  const buildThrottledApp = () => {
    const throttled = express();

    throttled.use(express.json());
    throttled.use(cookieParser());
    throttled.use('/api/v1/auth', createAuthRouter({ skipRateLimit: false }));
    throttled.use(errorHandler);

    return throttled;
  };

  test('forgot-password stops after its budget is spent', async () => {
    const throttled = buildThrottledApp();
    const { max } = EMAIL_SEND_RATE_LIMIT;

    for (let attempt = 1; attempt <= max; attempt += 1) {
      const allowed = await request(throttled)
        .post(`${API}/auth/forgot-password`)
        .send({ email: uniqueEmail() });

      assert.equal(allowed.status, 200, `request ${attempt} of ${max} should be allowed`);
    }

    const blocked = await request(throttled)
      .post(`${API}/auth/forgot-password`)
      .send({ email: uniqueEmail() });

    assert.equal(blocked.status, 429, 'the request past the budget must be refused');
  });

  test('reset-password stops after its own budget is spent', async () => {
    const throttled = buildThrottledApp();
    const { max } = PASSWORD_RESET_RATE_LIMIT;

    for (let attempt = 1; attempt <= max; attempt += 1) {
      const response = await request(throttled)
        .post(`${API}/auth/reset-password`)
        .send({ token: generateEmailToken(), password: NEW_PASSWORD });

      assert.equal(
        response.status,
        400,
        `request ${attempt} of ${max} should reach the handler, not the limiter`
      );
    }

    const blocked = await request(throttled)
      .post(`${API}/auth/reset-password`)
      .send({ token: generateEmailToken(), password: NEW_PASSWORD });

    assert.equal(blocked.status, 429, 'the token endpoint must be throttled too');
  });

  test('the credential endpoints keep their stricter budget', async () => {
    const throttled = buildThrottledApp();

    let blockedAt = null;

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const response = await request(throttled)
        .post(`${API}/auth/login`)
        .send({ email: uniqueEmail(), password: DEFAULT_PASSWORD });

      if (response.status === 429) {
        blockedAt = attempt;
        break;
      }
    }

    assert.equal(blockedAt, 11, 'login should be refused on the 11th attempt of 10');
  });
});
