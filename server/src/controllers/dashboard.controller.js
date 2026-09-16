import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import * as dashboardService from '../services/dashboard.service.js';

export const getWorkspaceDashboard = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getWorkspaceDashboard(
    req.params.workspaceId,
    req.user._id
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Workspace dashboard retrieved successfully', dashboard));
});

export const getProjectDashboard = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getProjectDashboard(
    req.params.workspaceId,
    req.params.projectId,
    req.user._id,
    req.validatedQuery ?? {}
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Project dashboard retrieved successfully', dashboard));
});
