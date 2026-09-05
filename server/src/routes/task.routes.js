import express from 'express';

import taskController from '../controllers/task.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';

import {
  createTaskSchema,
  projectTasksSchema,
  taskIdSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  updateTaskPrioritySchema,
  assignTaskSchema,
  taskDueDateSchema,
} from '../validators/task.validator.js';

const router = express.Router();

router.post(
  '/:workspaceId/projects/:projectId/tasks',
  authenticate,
  validate(createTaskSchema),
  requireWorkspaceMember,
  taskController.createTask
);

router.get(
  '/:workspaceId/projects/:projectId/tasks',
  authenticate,
  validate(projectTasksSchema),
  requireWorkspaceMember,
  taskController.getProjectTasks
);

router.get(
  '/:workspaceId/projects/:projectId/tasks/:taskId',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  taskController.getTaskById
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId',
  authenticate,
  validate(updateTaskSchema),
  requireWorkspaceMember,
  taskController.updateTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/archive',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  taskController.archiveTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/restore',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  taskController.restoreTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/status',
  authenticate,
  validate(updateTaskStatusSchema),
  requireWorkspaceMember,
  taskController.updateTaskStatus
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/priority',
  authenticate,
  validate(updateTaskPrioritySchema),
  requireWorkspaceMember,
  taskController.updateTaskPriority
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/assignee',
  authenticate,
  validate(assignTaskSchema),
  requireWorkspaceMember,
  taskController.assignTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/due-date',
  authenticate,
  validate(taskDueDateSchema),
  requireWorkspaceMember,
  taskController.updateTaskDueDate
);

export default router;
