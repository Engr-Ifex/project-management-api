import express from 'express';

import taskController from '../controllers/task.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';
import requireWorkspacePermission from '../middlewares/requireWorkspacePermission.middleware.js';

import {
  createTaskSchema,
  projectTasksSchema,
  taskIdSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  updateTaskPrioritySchema,
  assignTaskSchema,
  taskDueDateSchema,
  taskStartDateSchema,
  createSubtaskSchema,
  updateSubtaskSchema,
  subtaskIdSchema,
} from '../validators/task.validator.js';

const router = express.Router();

router.post(
  '/:workspaceId/projects/:projectId/tasks',
  authenticate,
  validate(createTaskSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:create'),
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
  requireWorkspacePermission('task:update'),
  taskController.updateTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/archive',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:archive'),
  taskController.archiveTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/restore',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:restore'),
  taskController.restoreTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/status',
  authenticate,
  validate(updateTaskStatusSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:update'),
  taskController.updateTaskStatus
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/priority',
  authenticate,
  validate(updateTaskPrioritySchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:update'),
  taskController.updateTaskPriority
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/assignee',
  authenticate,
  validate(assignTaskSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:assign'),
  taskController.assignTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/due-date',
  authenticate,
  validate(taskDueDateSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:update'),
  taskController.updateTaskDueDate
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/start-date',
  authenticate,
  validate(taskStartDateSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:update'),
  taskController.updateTaskStartDate
);

router.post(
  '/:workspaceId/projects/:projectId/tasks/:taskId/subtasks',
  authenticate,
  validate(createSubtaskSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:create'),
  taskController.createSubtask
);

router.get(
  '/:workspaceId/projects/:projectId/tasks/:taskId/subtasks',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  taskController.getSubtasks
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId',
  authenticate,
  validate(updateSubtaskSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:update'),
  taskController.updateSubtask
);

router.delete(
  '/:workspaceId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId',
  authenticate,
  validate(subtaskIdSchema),
  requireWorkspaceMember,
  requireWorkspacePermission('task:delete'),
  taskController.deleteSubtask
);

export default router;
