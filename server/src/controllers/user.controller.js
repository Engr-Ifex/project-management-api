import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import userService from '../services/user.service.js';

export const getProfile = asyncHandler(async (req, res) => {
  const data = await userService.getProfile(req.user);

  return res.status(200).json(new ApiResponse(200, 'Profile retrieved successfully', data));
});

export const updateProfile = asyncHandler(async (req, res) => {
  const data = await userService.updateProfile(req.user.id, req.body);

  return res.status(200).json(new ApiResponse(200, 'Profile updated successfully', data));
});

export const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Please upload an avatar image');
  }

  const data = await userService.updateAvatar(req.user.id, `/uploads/avatars/${req.file.filename}`);

  return res.status(200).json(new ApiResponse(200, 'Avatar updated successfully', data));
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await userService.changePassword(req.user.id, currentPassword, newPassword);

  return res.status(200).json(new ApiResponse(200, 'Password changed successfully'));
});
