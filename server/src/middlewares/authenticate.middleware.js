import jwt from 'jsonwebtoken';

import User from '../models/User.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const authenticate = asyncHandler(async (req, res, next) => {
  // 1. Read the access token from the cookie
  const accessToken = req.cookies.accessToken;

  // 2. Check if the cookie exists
  if (!accessToken) {
    throw new ApiError(401, 'Authentication required');
  }

  // 3. Verify the JWT
  const decoded = jwt.verify(accessToken, env.jwtAccessSecret);

  // 4. Find the user
  const user = await User.findActiveById(decoded.userId);

  // 5. Ensure the user still exists
  if (!user) {
    throw new ApiError(401, 'User no longer exists');
  }

  // 6. Attach the user to the request
  req.user = user;

  // 7. Continue
  next();
});

export default authenticate;
