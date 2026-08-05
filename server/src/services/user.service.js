import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import sanitizeUser from '../utils/sanitizeUser.js';

const getProfile = async (user) => {
  return {
    user: sanitizeUser(user),
  };
};

const updateProfile = async (userId, updateData) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (updateData.name !== undefined) {
    user.name = updateData.name;
  }

  await user.save();

  return {
    user: sanitizeUser(user),
  };
};

const updateAvatar = async (userId, avatarPath) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  user.avatar = avatarPath;

  await user.save();

  return {
    user: sanitizeUser(user),
  };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  // Find the user and include the password
  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Verify current password
  const isPasswordCorrect = await user.comparePassword(currentPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  // Prevent using the same password
  const isSamePassword = await user.comparePassword(newPassword);

  if (isSamePassword) {
    throw new ApiError(400, 'New password must be different from the current password');
  }

  // Set the new password
  // The pre('save') hook will hash it automatically
  user.password = newPassword;

  await user.save();

  return null;
};

const userService = {
  getProfile,
  updateProfile,
  updateAvatar,
  changePassword,
};

export default userService;
