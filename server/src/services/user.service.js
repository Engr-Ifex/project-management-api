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

const userService = {
  getProfile,
  updateProfile,
  updateAvatar,
};

export default userService;
