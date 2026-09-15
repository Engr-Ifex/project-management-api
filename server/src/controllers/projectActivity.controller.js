import * as projectActivityService from '../services/projectActivity.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const getProjectActivities = asyncHandler(async (req, res) => {
  const result = await projectActivityService.getProjectActivities(
    req.params.workspaceId,
    req.params.projectId,
    req.validatedQuery ?? {}
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Project activities retrieved successfully', result));
});

export const getTaskActivities = asyncHandler(async (req, res) => {
  const result = await projectActivityService.getTaskActivities(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.validatedQuery ?? {}
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Task activities retrieved successfully', result));
});

const projectActivityController = {
  getProjectActivities,
  getTaskActivities,
};

export default projectActivityController;
