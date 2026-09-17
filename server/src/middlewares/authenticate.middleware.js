import jwt from 'jsonwebtoken';

import User from '../models/User.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

import { JWT_ALGORITHMS } from '../constants/security.js';
import { OBJECT_ID_REGEX } from '../constants/regex.js';

const authenticate = asyncHandler(async (req, res, next) => {
  // 1. Read the access token from the cookie
  const accessToken = req.cookies.accessToken;

  // 2. Check if the cookie exists
  if (!accessToken) {
    throw new ApiError(401, 'Authentication required');
  }

  /*
   * 3. Verify the JWT.
   *
   * `algorithms` is pinned so the verifier cannot be talked into trusting an
   * algorithm named by the token header. Verification failures (expired,
   * malformed, bad signature) are translated to 401 by the error middleware.
   */
  const decoded = jwt.verify(accessToken, env.jwtAccessSecret, {
    algorithms: JWT_ALGORITHMS,
  });

  /*
   * The payload is checked before use. A token that verifies but carries no
   * usable subject would otherwise reach the query layer and surface as a
   * CastError (400) instead of an authentication failure.
   */
  if (!decoded || typeof decoded !== 'object' || !OBJECT_ID_REGEX.test(String(decoded.userId))) {
    throw new ApiError(401, 'Invalid access token');
  }

  // 4. Find the user
  const user = await User.findActiveById(decoded.userId);

  // 5. Ensure the user still exists
  if (!user) {
    throw new ApiError(401, 'User no longer exists');
  }

  /*
   * 6. Reject tokens issued before the password last changed.
   *
   * Access tokens are stateless, so a password change previously left every
   * already-issued token valid until it expired. Comparing the token's
   * issued-at claim against the recorded change time closes that window.
   *
   * `iat` is recorded in whole seconds, so a token minted in the same second
   * as the change can legitimately appear older than it. The one-second
   * tolerance below removes that false rejection without meaningfully widening
   * the window.
   *
   * Accounts that have never changed their password have no timestamp and are
   * unaffected.
   */
  if (user.passwordChangedAt && decoded.iat) {
    const ISSUED_AT_RESOLUTION_MS = 1000;
    const issuedAt = decoded.iat * 1000;

    if (issuedAt < user.passwordChangedAt.getTime() - ISSUED_AT_RESOLUTION_MS) {
      throw new ApiError(401, 'Session expired, please log in again');
    }
  }

  // 7. Attach the user to the request
  req.user = user;

  // 8. Continue
  next();
});

export default authenticate;
