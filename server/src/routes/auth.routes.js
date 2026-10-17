import express from 'express';

import {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import validate from '../middlewares/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';
import authenticate from '../middlewares/authenticate.middleware.js';

import { createRateLimiter } from '../middlewares/rateLimit.middleware.js';
import {
  AUTH_RATE_LIMIT,
  EMAIL_SEND_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
} from '../constants/security.js';
import env from '../config/env.js';

/*
 * Authentication routes.
 *
 * Built by a factory rather than as a module-level singleton so the rate
 * limiters can be mounted with their production behaviour in a test.
 *
 * Under `NODE_ENV=test` every request in the suite originates from one address,
 * so the limiters are bypassed — otherwise they would throttle the tests instead
 * of an attacker. The side effect is that the wiring below is never exercised by
 * the suite that covers these endpoints, so `tests/auth-email.test.js` imports
 * this factory with `skipRateLimit: false` and mounts the **real** routes. That
 * proves the throttling is actually attached, rather than testing a limiter in
 * isolation and assuming somebody remembered to add it.
 */
export const createAuthRouter = ({ skipRateLimit = env.isTest } = {}) => {
  const router = express.Router();

  /** A real limiter in production, a pass-through in test. */
  const limited = (config) =>
    skipRateLimit ? (req, res, next) => next() : createRateLimiter(config);

  /*
   * Credential endpoints get their own, much stricter budget than the rest of
   * the API. This is the control that makes online password guessing and
   * account-enumeration probing impractical.
   */
  const authLimiter = limited(AUTH_RATE_LIMIT);

  /*
   * The email-sending endpoints are a different threat: they are *amplifiers*.
   * One request makes the application send one message to an address the caller
   * chose, so without a limit they are an open relay for harassing a third party
   * and for burning the provider's sending quota. See `constants/security.js`.
   */
  const emailSendLimiter = limited(EMAIL_SEND_RATE_LIMIT);

  /*
   * The token-submitting endpoint gets a third budget. `reset-password` accepts
   * a secret and answers whether it is valid, which is a guessing surface — the
   * token is far too large to brute-force, but the endpoint should not be a free
   * oracle either.
   */
  const tokenLimiter = limited(PASSWORD_RESET_RATE_LIMIT);

  /* ---- session ---- */

  router.post('/register', authLimiter, validate(registerSchema), register);
  router.post('/login', authLimiter, validate(loginSchema), login);
  router.post('/logout', authenticate, logout);

  /* ---- password reset ---- */

  router.post('/forgot-password', emailSendLimiter, validate(forgotPasswordSchema), forgotPassword);

  router.post('/reset-password', tokenLimiter, validate(resetPasswordSchema), resetPassword);

  return router;
};

export default createAuthRouter();
