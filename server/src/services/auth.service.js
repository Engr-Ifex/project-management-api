import bcrypt from 'bcrypt';

import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import sanitizeUser from '../utils/sanitizeUser.js';

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

  // Create the user (password is hashed automatically by the pre-save hook)
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
};

export default authService;
