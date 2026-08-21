import { Router } from 'express';

import projectController from '../controllers/project.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';
import requireWorkspacePermission from '../middlewares/requireWorkspacePermission.middleware.js';

import { createProjectSchema } from '../validators/project.validator.js';

import { WORKSPACE_PERMISSIONS } from '../constants/workspacePermissions.js';

const router = Router();

router.post(
  '/workspaces/:workspaceId/projects',
  authenticate,
  validate(createProjectSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE),
  projectController.createProject
);

export default router;
