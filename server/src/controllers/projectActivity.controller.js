import * as projectActivityService from '../services/projectActivity.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const getProjectActivities = asyncHandler(async (req, res) => {
  const activities = await projectActivityService.getProjectActivities(
    req.params.workspaceId,
    req.params.projectId
  );

  return res.status(200).json(
    new ApiResponse(200, 'Project activities retrieved successfully', {
      activities,
    })
  );
});

export const getTaskActivities = asyncHandler(async (req, res) => {
  const activities = await projectActivityService.getTaskActivities(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Task activities retrieved successfully', { activities }));
});

const projectActivityController = {
  getProjectActivities,
  getTaskActivities,
};

export default projectActivityController;
