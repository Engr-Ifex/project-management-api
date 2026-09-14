import { Router } from 'express';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';
import requireProjectPermission from '../middlewares/requireProjectPermission.middleware.js';

import * as labelController from '../controllers/label.controller.js';

import {
  createLabelSchema,
  updateLabelSchema,
  projectLabelsSchema,
  labelIdSchema,
  assignLabelSchema,
  removeLabelSchema,
} from '../validators/label.validator.js';

const router = Router();

router.post(
  '/:workspaceId/projects/:projectId/labels',
  authenticate,
  validate(createLabelSchema),
  requireWorkspaceMember,
  requireProjectPermission('label:create'),
  labelController.createLabel
);

router.get(
  '/:workspaceId/projects/:projectId/labels',
  authenticate,
  validate(projectLabelsSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  labelController.getProjectLabels
);

router.get(
  '/:workspaceId/projects/:projectId/labels/:labelId',
  authenticate,
  validate(labelIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  labelController.getLabelById
);

router.patch(
  '/:workspaceId/projects/:projectId/labels/:labelId',
  authenticate,
  validate(updateLabelSchema),
  requireWorkspaceMember,
  requireProjectPermission('label:update'),
  labelController.updateLabel
);

router.delete(
  '/:workspaceId/projects/:projectId/labels/:labelId',
  authenticate,
  validate(labelIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('label:delete'),
  labelController.deleteLabel
);

router.post(
  '/:workspaceId/projects/:projectId/tasks/:taskId/labels',
  authenticate,
  validate(assignLabelSchema),
  requireWorkspaceMember,
  requireProjectPermission('label:assign'),
  labelController.assignLabelToTask
);

router.delete(
  '/:workspaceId/projects/:projectId/tasks/:taskId/labels/:labelId',
  authenticate,
  validate(removeLabelSchema),
  requireWorkspaceMember,
  requireProjectPermission('label:assign'),
  labelController.removeLabelFromTask
);

export default router;
