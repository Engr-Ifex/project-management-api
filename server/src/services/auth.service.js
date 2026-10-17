import bcrypt from 'bcrypt';

import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import sanitizeUser from '../utils/sanitizeUser.js';
import logger from '../utils/logger.js';

import { sendEmail } from './email.service.js';
import { buildPasswordResetEmail } from '../emails/resetPassword.js';
import { buildPasswordResetUrl } from '../utils/emailLinks.js';
import {
  generateEmailToken,
  hashEmailToken,
  emailTokenExpiry,
  isExpired,
} from '../utils/emailTokens.js';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '../constants/security.js';

/*
 * A bcrypt hash of a value no caller can supply.
 *
 * When the email is unknown there is no stored hash to compare against, so
 * `bcrypt.compare` would be skipped and the response would return far faster
 * than a wrong-password attempt. That difference is measurable and turns login
 * response time into an account-enumeration oracle. Comparing against this
 * constant performs equivalent work for both cases.
 *
 * It is a hash of a random string, not a usable credential, and the comparison
 * always fails.
 */
const DUMMY_PASSWORD_HASH = '$2b$10$2ThzCpzASHNgmin1VpZ1se.C61qtkzmB/D5mWxV2Y1JcvN.n5WjPm';

export const registerUser = async (userData) => {
  const { name, email, password } = userData;

  // Check if the email already exists
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(409, 'Email already exists');
  }

  /*
   * Create the user (password is hashed automatically by the pre-save hook).
   *
   * Registration produces a fully usable account: it can sign in and create or
   * join a workspace immediately. There is no email-confirmation step and no
   * `isVerified` flag, which is what makes the product usable on a deployment
   * with no verified sending domain configured.
   *
   * No email is sent here. Sending is now confined to the password-reset flow,
   * so a registration cannot fail — or silently half-succeed — because a mail
   * provider was unavailable.
   */
  const user = await User.create({
    name,
    email,
    password,
  });

  // Generate access token
  const accessToken = user.generateAccessToken();

  // Return only business data
  return {
    user: sanitizeUser(user),
    accessToken,
  };
};

/*
 * ---------------------------------------------------------------------------
 * Password reset
 * ---------------------------------------------------------------------------
 */

/**
 * Start a password reset for an address, if it belongs to an account.
 *
 * **Returns without distinguishing the two cases**, and the controller turns
 * both into the same response. That is the entire point: a caller must not be
 * able to use this endpoint to test whether an address has an account here.
 *
 * `sent: false` means "no email went out, and that is all we will say about it"
 * — either because no active account matched, or because the provider refused
 * the message. The second case is logged at error level by the email service, so
 * it is not silent operationally, but it is deliberately invisible to the
 * caller: a distinct failure response would occur *only* for addresses that do
 * have accounts, which reintroduces exactly the oracle this endpoint exists to
 * avoid.
 *
 * Nothing about the password changes here. The only side effect is a token that
 * has to be presented, unexpired, before anything is written.
 */
export const requestPasswordReset = async (email) => {
  const user = await User.findActiveByEmail(email);

  if (!user) {
    /*
     * Burn comparable time to the real path.
     *
     * The honest path performs a database write and a network round trip to the
     * provider; this one does nothing. Returning immediately would make an
     * unknown address measurably faster, and response time is an enumeration
     * channel that survives a generic response body. A small fixed delay is not
     * a perfect equaliser, but it removes the order-of-magnitude difference.
     */
    await new Promise((resolve) => setTimeout(resolve, 120));

    return { user: null, sent: false };
  }

  const token = generateEmailToken();

  user.passwordResetToken = {
    hash: hashEmailToken(token),
    expiresAt: emailTokenExpiry(PASSWORD_RESET_TOKEN_TTL_MS),
    requestedAt: new Date(),
  };

  await user.save();

  const { subject, html, text } = buildPasswordResetEmail({
    name: user.name,
    url: buildPasswordResetUrl(token),
  });

  try {
    await sendEmail({ to: user.email, subject, html, text });

    return { user, sent: true };
  } catch (error) {
    /*
     * The token is already stored. Leaving it would be harmless — nobody
     * received it — but clearing it keeps the database honest: an outstanding
     * reset token that no one holds is a loose end, and the next request mints a
     * fresh one anyway.
     */
    user.passwordResetToken = { hash: null, expiresAt: null, requestedAt: null };

    await user.save();

    logger.error('Password reset email could not be sent', {
      userId: user._id.toString(),
      reason: error.message,
    });

    return { user: null, sent: false };
  }
};

/**
 * Complete a reset with the token from the email.
 *
 * Order matters: the token is validated *before* the password is touched, so a
 * bad or stale token can never partially apply.
 */
export const resetPassword = async (token, newPassword) => {
  const user = await User.findOne({
    'passwordResetToken.hash': hashEmailToken(token),
    isDeleted: false,
  });

  if (!user) {
    throw new ApiError(
      400,
      'This password reset link is invalid or has already been used. Request a new one and try again.'
    );
  }

  if (isExpired(user.passwordResetToken?.expiresAt)) {
    throw new ApiError(
      400,
      'This password reset link has expired. Request a new one and try again.'
    );
  }

  /*
   * Assign the plaintext and let the existing `pre('save')` hook do the work.
   *
   * Not a shortcut — it is what keeps the password policy in one place. The hook
   * applies `BCRYPT_SALT_ROUNDS` and stamps `passwordChangedAt`, and
   * `passwordChangedAt` is the mechanism `authenticate.middleware.js` already
   * uses to reject access tokens issued before a password change. So a
   * successful reset revokes every existing session for the account, through the
   * mechanism the application already had, with no new revocation system.
   *
   * What that covers, and what it does not, is set out in the completion report:
   * it revokes *access tokens*, which is the only credential this architecture
   * issues. There is no refresh token and no server-side session store.
   */
  user.password = newPassword;

  // Cleared before saving, so the token cannot be spent twice even if the write
  // is retried.
  user.passwordResetToken = { hash: null, expiresAt: null, requestedAt: null };

  await user.save();

  return { user: sanitizeUser(user) };
};

/*
 * ---------------------------------------------------------------------------
 * Session
 * ---------------------------------------------------------------------------
 */

export const loginUser = async ({ email, password }) => {
  // Find the user and include the password field
  const user = await User.findActiveByEmail(email).select('+password');

  /*
   * Check if the user exists.
   *
   * The throwaway comparison keeps the timing of this branch indistinguishable
   * from a wrong password, and the message is identical either way so the
   * response never reveals whether the account exists.
   */
  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);

    throw new ApiError(401, 'Invalid email or password');
  }

  // Compare the entered password with the hashed password
  const isPasswordCorrect = await user.comparePassword(password);

  if (!isPasswordCorrect) {
    throw new ApiError(401, 'Invalid email or password');
  }

  // Generate access token
  const accessToken = user.generateAccessToken();

  return {
    user: sanitizeUser(user),
    accessToken,
  };
};

const logoutUser = async () => {
  return;
};

const authService = {
  registerUser,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
};

export default authService;
