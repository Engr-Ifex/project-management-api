import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';

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
    user,
    accessToken,
  };
};

const authService = {
  registerUser,
};

export default authService;