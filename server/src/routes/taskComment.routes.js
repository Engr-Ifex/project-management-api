import { Router } from 'express';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';

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
  taskCommentController.createTaskComment
);

router.get(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments',
  authenticate,
  validate(getTaskCommentsSchema),
  requireWorkspaceMember,
  taskCommentController.getTaskComments
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId',
  authenticate,
  validate(updateTaskCommentSchema),
  requireWorkspaceMember,
  taskCommentController.updateTaskComment
);

router.delete(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId',
  authenticate,
  validate(taskCommentIdSchema),
  requireWorkspaceMember,
  taskCommentController.deleteTaskComment
);

export default router;