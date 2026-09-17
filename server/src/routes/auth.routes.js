import express from 'express';

import { register, login, logout } from '../controllers/auth.controller.js';
import validate from '../middlewares/validate.middleware.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import authenticate from '../middlewares/authenticate.middleware.js';

import { createRateLimiter } from '../middlewares/rateLimit.middleware.js';
import { AUTH_RATE_LIMIT } from '../constants/security.js';
import env from '../config/env.js';

const router = express.Router();

/*
 * Credential endpoints get their own, much stricter budget than the rest of
 * the API. This is the control that makes online password guessing and
 * account-enumeration probing impractical.
 *
 * Skipped under NODE_ENV=test, where the entire suite originates from one
 * address and the limiter would throttle the tests instead of an attacker. The
 * limiter itself is covered by dedicated tests that mount their own instance.
 */
const authLimiter = env.isTest ? (req, res, next) => next() : createRateLimiter(AUTH_RATE_LIMIT);

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/logout', authenticate, logout);

export default router;
