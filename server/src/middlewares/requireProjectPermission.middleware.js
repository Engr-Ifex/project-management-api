import ApiError from '../utils/ApiError.js';
import Project from '../models/Project.js';

import { hasProjectPermission } from '../constants/projectRolePermissions.js';

import { hasProjectOverride } from '../constants/rolePermissions.js';

const requireProjectPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const { workspaceId, projectId } = req.params;

      if (!req.workspaceMember) {
        return next(new ApiError(403, 'You are not a member of this workspace'));
      }

      const project = await Project.findOne({
        _id: projectId,
        workspace: workspaceId,
        isArchived: false,
      });

      if (!project) {
        return next(new ApiError(404, 'Project not found'));
      }

      const userId = req.user._id;

      /*
       * Workspace owner/admin override.
       *
       * Workspace owners and admins hold authority over every project inside
       * their workspace, so they pass without a project role. The decision is
       * defined once in `hasProjectOverride` and applied here and in the
       * services that need it, so the two cannot drift apart.
       */
      if (hasProjectOverride(req.workspaceMember.role)) {
        return next();
      }

      /*
       * Find the user's project membership.
       */
      const projectMember = project.members.find(
        (member) => member.user.toString() === userId.toString()
      );

      if (!projectMember) {
        return next(new ApiError(403, 'You are not a member of this project'));
      }

      /*
       * Check the user's project role.
       */
      const hasAccess = hasProjectPermission(projectMember.role, permission);

      if (!hasAccess) {
        return next(new ApiError(403, 'You do not have permission to perform this action'));
      }

      /*
       * Make project information available to
       * controllers/services if needed later.
       */
      req.project = project;
      req.projectMember = projectMember;

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default requireProjectPermission;
