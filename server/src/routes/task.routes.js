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

/*
 * Reading a project's work requires a project role.
 *
 * These three reads previously required only workspace membership, which made
 * the read surface inconsistent: comments, labels, attachments, the dashboard
 * and the activity trail all require `project:view`, while tasks and subtasks
 * did not. The gap was not theoretical — a task response populates its
 * `labels` with names and colours, so a workspace member holding no project
 * role could read label data through the task route that the label routes
 * deliberately refuse them.
 *
 * Workspace membership still grants the project *record* and the project list
 * (`project.routes.js`), so a member can discover what exists in the workspace.
 * Everything inside a project needs a project role, or the workspace
 * owner/admin override that `requireProjectPermission` applies.
 */
router.get(
  '/:workspaceId/projects/:projectId/tasks',
  authenticate,
  validate(projectTasksSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  taskController.getProjectTasks
);

router.get(
  '/:workspaceId/projects/:projectId/tasks/:taskId',
  authenticate,
  validate(taskIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
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
  requireProjectPermission('project:view'),
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
