import authService from '../services/auth.service.js';
import { getCookieOptions } from '../constants/cookie.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const register = asyncHandler(async (req, res) => {
  const { user, accessToken } = await authService.registerUser(req.body);

  res.cookie('accessToken', accessToken, getCookieOptions());

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

export const getCurrentUser = asyncHandler(async (req, res) => {
  const data = await authService.getCurrentUser(req.user);

  return res.status(200).json(new ApiResponse(200, 'Current user retrieved successfully', data));
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logoutUser();

  res.clearCookie('accessToken', getCookieOptions());

  return res.status(200).json(new ApiResponse(200, 'Logout successful'));
});
