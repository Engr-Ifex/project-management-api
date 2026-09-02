import { Router } from 'express';

import projectController from '../controllers/project.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';
import requireWorkspacePermission from '../middlewares/requireWorkspacePermission.middleware.js';

import {
  createProjectSchema,
  workspaceProjectsSchema,
  projectIdSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from '../validators/project.validator.js';

import { WORKSPACE_PERMISSIONS } from '../constants/workspacePermissions.js';

const router = Router();

router.post(
  '/:workspaceId/projects',
  authenticate,
  validate(createProjectSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE),
  projectController.createProject
);

router.get(
  '/:workspaceId/projects',
  authenticate,
  validate(workspaceProjectsSchema),
  requireWorkspaceMember,
  projectController.getWorkspaceProjects
);

router.get(
  '/:workspaceId/projects/:projectId',
  authenticate,
  validate(projectIdSchema),
  requireWorkspaceMember,
  projectController.getProjectById
);

router.patch(
  '/:workspaceId/projects/:projectId',
  authenticate,
  validate(updateProjectSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE),
  projectController.updateProject
);

router.patch(
  '/:workspaceId/projects/:projectId/archive',
  authenticate,
  validate(projectIdSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE),
  projectController.archiveProject
);

router.patch(
  '/:workspaceId/projects/:projectId/restore',
  authenticate,
  validate(projectIdSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE),
  projectController.restoreProject
);
router.patch(
  '/:workspaceId/projects/:projectId/status',
  authenticate,
  validate(updateProjectStatusSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE),
  projectController.updateProjectStatus
);

export default router;
