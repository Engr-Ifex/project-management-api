import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import sanitizeUser from '../utils/sanitizeUser.js';

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
  const user = await User.findOne({ email }).select('+password');

  // Check if the user exists
  if (!user) {
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
