import { Router } from 'express';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';
import requireProjectPermission from '../middlewares/requireProjectPermission.middleware.js';

import * as taskCommentController from '../controllers/taskComment.controller.js';

import {
  createTaskCommentSchema,
  updateTaskCommentSchema,
  taskCommentIdSchema,
  getTaskCommentsSchema,
} from '../validators/taskComment.validator.js';

const router = Router();

router.post(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments',
  authenticate,
  validate(createTaskCommentSchema),
  requireWorkspaceMember,
  requireProjectPermission('comment:create'),
  taskCommentController.createTaskComment
);

router.get(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments',
  authenticate,
  validate(getTaskCommentsSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  taskCommentController.getTaskComments
);

router.get(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId',
  authenticate,
  validate(taskCommentIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  taskCommentController.getTaskCommentById
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId',
  authenticate,
  validate(updateTaskCommentSchema),
  requireWorkspaceMember,
  requireProjectPermission('comment:update'),
  taskCommentController.updateTaskComment
);

router.delete(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId',
  authenticate,
  validate(taskCommentIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('comment:delete'),
  taskCommentController.deleteTaskComment
);

export default router;
