import * as taskService from '../services/task.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const createTask = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(
    req.params.workspaceId,
    req.params.projectId,
    req.user.id,
    req.body
  );

  return res.status(201).json(
    new ApiResponse(201, 'Task created successfully', {
      task,
    })
  );
});

export const getProjectTasks = asyncHandler(async (req, res) => {
  const result = await taskService.getProjectTasks(
    req.params.workspaceId,
    req.params.projectId,
    req.validatedQuery ?? {}
  );

  return res.status(200).json(new ApiResponse(200, 'Tasks retrieved successfully', result));
});

export const getTaskById = asyncHandler(async (req, res) => {
  const task = await taskService.getTaskById(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId
  );

  return res.status(200).json(
    new ApiResponse(200, 'Task retrieved successfully', {
      task,
    })
  );
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await taskService.updateTask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.body,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Task updated successfully', {
      task,
    })
  );
});

export const archiveTask = asyncHandler(async (req, res) => {
  const task = await taskService.archiveTask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Task archived successfully', {
      task,
    })
  );
});

export const restoreTask = asyncHandler(async (req, res) => {
  const task = await taskService.restoreTask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Task restored successfully', {
      task,
    })
  );
});

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const task = await taskService.updateTaskStatus(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.body.status,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Task status updated successfully', {
      task,
    })
  );
});

export const updateTaskPriority = asyncHandler(async (req, res) => {
  const task = await taskService.updateTaskPriority(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.body.priority,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Task priority updated successfully', {
      task,
    })
  );
});

export const assignTask = asyncHandler(async (req, res) => {
  const task = await taskService.assignTask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.body.assignee,
    req.user.id
  );

  return res.status(200).json(new ApiResponse(200, 'Task assignee updated successfully', { task }));
});

export const updateTaskDueDate = asyncHandler(async (req, res) => {
  const task = await taskService.updateTaskDueDate(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.body.dueDate,
    req.user.id
  );

  return res.status(200).json(new ApiResponse(200, 'Task due date updated successfully', { task }));
});

export const updateTaskStartDate = asyncHandler(async (req, res) => {
  const task = await taskService.updateTaskStartDate(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.body.startDate,
    req.user._id
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Task start date updated successfully', { task }));
});

export const createSubtask = asyncHandler(async (req, res) => {
  const subtask = await taskService.createSubtask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.user._id,
    req.body.title
  );

  return res.status(201).json(new ApiResponse(201, 'Subtask created successfully', { subtask }));
});

export const getSubtasks = asyncHandler(async (req, res) => {
  const subtasks = await taskService.getSubtasks(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Subtasks retrieved successfully', { subtasks }));
});

export const updateSubtask = asyncHandler(async (req, res) => {
  const subtask = await taskService.updateSubtask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.params.subtaskId,
    req.user._id,
    req.body
  );

  return res.status(200).json(new ApiResponse(200, 'Subtask updated successfully', { subtask }));
});

export const deleteSubtask = asyncHandler(async (req, res) => {
  await taskService.deleteSubtask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.params.subtaskId,
    req.user._id
  );

  return res.status(200).json(new ApiResponse(200, 'Subtask deleted successfully'));
});

const taskController = {
  createTask,
  getProjectTasks,
  getTaskById,
  updateTask,
  archiveTask,
  restoreTask,
  updateTaskStatus,
  updateTaskPriority,
  assignTask,
  updateTaskDueDate,
  updateTaskStartDate,
  createSubtask,
  getSubtasks,
  updateSubtask,
  deleteSubtask,
};

export default taskController;
