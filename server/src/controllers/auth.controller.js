import authService from '../services/auth.service.js';
import { cookieOptions } from '../constants/cookie.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const register = asyncHandler(async (req, res) => {
  const { user, accessToken } = await authService.registerUser(req.body);

  res.cookie('accessToken', accessToken, cookieOptions);

  return res.status(201).json(
    new ApiResponse(
      201,
      'User registered successfully',
      {
        user,
      }
    )
  );
});