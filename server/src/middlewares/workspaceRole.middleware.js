import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const requireWorkspaceRole = (...allowedRoles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.workspaceMember) {
      throw new ApiError(403, 'Workspace membership is required');
    }

    if (!allowedRoles.includes(req.workspaceMember.role)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }

    next();
  });
};

export default requireWorkspaceRole;
