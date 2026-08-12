import { Router } from 'express';

import workspaceController from '../controllers/workspace.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';

import {
  requireWorkspaceMember,
  requireArchivedWorkspaceMember,
  requireWorkspaceMemberAnyState,
} from '../middlewares/workspace.middleware.js';

import requireWorkspaceRole from '../middlewares/workspaceRole.middleware.js';

import validate from '../middlewares/validate.middleware.js';

import {
  createWorkspaceSchema,
  workspaceIdSchema,
  updateWorkspaceSchema,
} from '../validators/workspace.validator.js';

import { WORKSPACE_ROLES } from '../constants/workspaceRoles.js';

const router = Router();

router.post(
  '/',
  authenticate,
  validate(createWorkspaceSchema),
  workspaceController.createWorkspace
);

router.get('/', authenticate, workspaceController.getUserWorkspaces);
router.get(
  '/:workspaceId',
  authenticate,
  validate(workspaceIdSchema),
  requireWorkspaceMember,
  workspaceController.getWorkspaceById
);
router.patch(
  '/:workspaceId',
  authenticate,
  validate(updateWorkspaceSchema),
  requireWorkspaceMember,
  requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN),
  workspaceController.updateWorkspace
);
router.patch(
  '/:workspaceId/archive',
  authenticate,
  validate(workspaceIdSchema),
  requireWorkspaceMember,
  requireWorkspaceRole(WORKSPACE_ROLES.OWNER),
  workspaceController.archiveWorkspace
);

router.patch(
  '/:workspaceId/restore',
  authenticate,
  validate(workspaceIdSchema),
  requireArchivedWorkspaceMember,
  requireWorkspaceRole(WORKSPACE_ROLES.OWNER),
  workspaceController.restoreWorkspace
);

router.delete(
  '/:workspaceId',
  authenticate,
  validate(workspaceIdSchema),
  requireWorkspaceMemberAnyState,
  requireWorkspaceRole(WORKSPACE_ROLES.OWNER),
  workspaceController.deleteWorkspace
);

export default router;
