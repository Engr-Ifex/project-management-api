import express from 'express';

import taskController from '../controllers/task.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';
import requireProjectPermission from '../middlewares/requireProjectPermission.middleware.js';

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
  requireProjectPermission('task:create'),
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
  requireProjectPermission('task:update'),
  taskController.updateTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/archive',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('task:archive'),
  taskController.archiveTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/restore',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('task:restore'),
  taskController.restoreTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/status',
  authenticate,
  validate(updateTaskStatusSchema),
  requireWorkspaceMember,
  requireProjectPermission('task:update'),
  taskController.updateTaskStatus
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/priority',
  authenticate,
  validate(updateTaskPrioritySchema),
  requireWorkspaceMember,
  requireProjectPermission('task:update'),
  taskController.updateTaskPriority
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/assignee',
  authenticate,
  validate(assignTaskSchema),
  requireWorkspaceMember,
  requireProjectPermission('task:assign'),
  taskController.assignTask
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/due-date',
  authenticate,
  validate(taskDueDateSchema),
  requireWorkspaceMember,
  requireProjectPermission('task:update'),
  taskController.updateTaskDueDate
);

router.patch(
  '/:workspaceId/projects/:projectId/tasks/:taskId/start-date',
  authenticate,
  validate(taskStartDateSchema),
  requireWorkspaceMember,
  requireProjectPermission('task:update'),
  taskController.updateTaskStartDate
);

router.post(
  '/:workspaceId/projects/:projectId/tasks/:taskId/subtasks',
  authenticate,
  validate(createSubtaskSchema),
  requireWorkspaceMember,
  requireProjectPermission('subtask:create'),
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
  requireProjectPermission('subtask:update'),
  taskController.updateSubtask
);

router.delete(
  '/:workspaceId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId',
  authenticate,
  validate(subtaskIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('subtask:delete'),
  taskController.deleteSubtask
);

export default router;
