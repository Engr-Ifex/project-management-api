import { Router } from 'express';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';
import requireWorkspacePermission from '../middlewares/requireWorkspacePermission.middleware.js';
import requireProjectPermission from '../middlewares/requireProjectPermission.middleware.js';

import * as dashboardController from '../controllers/dashboard.controller.js';

import {
  workspaceDashboardSchema,
  projectDashboardSchema,
} from '../validators/dashboard.validator.js';

import { WORKSPACE_PERMISSIONS } from '../constants/workspacePermissions.js';

const router = Router();

/*
 * Dashboard reads are aggregated views of data the caller can already reach,
 * so they reuse the existing authorization layers rather than inventing a new
 * one:
 *
 *   - workspace dashboard -> workspace membership + VIEW_WORKSPACE
 *   - project dashboard   -> workspace membership + project:view, matching the
 *     other project-scoped read endpoints (activities, labels, comments,
 *     attachments)
 */

router.get(
  '/:workspaceId/dashboard',
  authenticate,
  validate(workspaceDashboardSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.VIEW_WORKSPACE),
  dashboardController.getWorkspaceDashboard
);

router.get(
  '/:workspaceId/projects/:projectId/dashboard',
  authenticate,
  validate(projectDashboardSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  dashboardController.getProjectDashboard
);

export default router;
