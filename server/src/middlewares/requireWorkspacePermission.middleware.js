import ApiError from '../utils/ApiError.js';
import { hasPermission } from '../constants/rolePermissions.js';

const requireWorkspacePermission = (permission) => {
  return (req, res, next) => {
    if (!req.workspaceMember) {
      return next(new ApiError(403, 'You are not a member of this workspace'));
    }

    const hasAccess = hasPermission(req.workspaceMember.role, permission);

    if (!hasAccess) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }

    next();
  };
};

export default requireWorkspacePermission;
