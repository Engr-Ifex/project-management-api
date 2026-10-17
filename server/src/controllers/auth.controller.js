import authService from '../services/auth.service.js';
import { getCookieOptions } from '../constants/cookie.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const register = asyncHandler(async (req, res) => {
  const { user, accessToken } = await authService.registerUser(req.body);

  res.cookie('accessToken', accessToken, getCookieOptions());

  /*
   * The account is complete and the session is live — nothing is pending. There
   * is no confirmation step to report on and no `verificationEmailSent` flag,
   * because registration sends no email at all.
   */
  return res.status(201).json(
    new ApiResponse(201, 'User registered successfully', {
      user,
    })
  );
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken } = await authService.loginUser(req.body);

  res.cookie('accessToken', accessToken, getCookieOptions());

  return res.status(200).json(
    new ApiResponse(200, 'Login successful', {
      user,
    })
  );
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logoutUser();

  res.clearCookie('accessToken', getCookieOptions());

  return res.status(200).json(new ApiResponse(200, 'Logout successful'));
});

/* ------------------------------------------------------------------ email */

/**
 * Begin a password reset.
 *
 * ## The response is always the same
 *
 * One status, one message, whether or not the address has an account, and
 * whether or not the email was actually delivered.
 *
 * That is a deliberate trade. The alternative — reporting a provider failure —
 * would only ever happen for addresses that *do* have accounts, so the error
 * path itself becomes the account-existence oracle the endpoint is built to
 * avoid. Between "an attacker can enumerate users by forcing mail failures" and
 * "a user whose mail provider hiccuped is told to check their inbox", the second
 * is the smaller harm, and it is not silent: the email service logs the
 * provider's own error at error level, so an operator sees it immediately.
 *
 * The message is phrased as a conditional for the same reason. "We have sent you
 * a link" would be false for an unknown address; "if an account exists" is true
 * in both cases and still tells a real user what to do next.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        'If an account exists for that address, a password reset link is on its way.'
      )
    );
});

/**
 * Complete a reset.
 *
 * No session is issued on success, and the user is sent to sign in with the new
 * password. That is not laziness: the password change stamps
 * `passwordChangedAt`, which invalidates every access token already issued for
 * the account — including one this response might set. Issuing a cookie here
 * would be handing back a token that the next request rejects.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { user } = await authService.resetPassword(req.body.token, req.body.password);

  return res.status(200).json(
    new ApiResponse(200, 'Password updated. You can now sign in with your new password.', {
      user,
    })
  );
});
