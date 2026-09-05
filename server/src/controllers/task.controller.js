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

export const getProjectTasks = asyncHandler(
  async (req, res) => {
    const tasks =
      await taskService.getProjectTasks(
        req.params.workspaceId,
        req.params.projectId
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Tasks retrieved successfully',
        {
          tasks,
        }
      )
    );
  }
);

export const getTaskById = asyncHandler(
  async (req, res) => {
    const task =
      await taskService.getTaskById(
        req.params.workspaceId,
        req.params.projectId,
        req.params.taskId
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Task retrieved successfully',
        {
          task,
        }
      )
    );
  }
);

export const updateTask = asyncHandler(
  async (req, res) => {
    const task =
      await taskService.updateTask(
        req.params.workspaceId,
        req.params.projectId,
        req.params.taskId,
        req.body,
        req.user.id
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Task updated successfully',
        {
          task,
        }
      )
    );
  }
);

export const archiveTask = asyncHandler(
  async (req, res) => {
    const task =
      await taskService.archiveTask(
        req.params.workspaceId,
        req.params.projectId,
        req.params.taskId,
        req.user.id
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Task archived successfully',
        {
          task,
        }
      )
    );
  }
);

export const restoreTask = asyncHandler(
  async (req, res) => {
    const task =
      await taskService.restoreTask(
        req.params.workspaceId,
        req.params.projectId,
        req.params.taskId,
        req.user.id
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Task restored successfully',
        {
          task,
        }
      )
    );
  }
);

export const updateTaskStatus = asyncHandler(
  async (req, res) => {
    const task =
      await taskService.updateTaskStatus(
        req.params.workspaceId,
        req.params.projectId,
        req.params.taskId,
        req.body.status,
        req.user.id
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Task status updated successfully',
        {
          task,
        }
      )
    );
  }
);

const taskController = {
  createTask,
  getProjectTasks,
  getTaskById,
  updateTask,
  archiveTask,
  restoreTask,
  updateTaskStatus,
};

export default taskController;
