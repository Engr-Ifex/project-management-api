import workspaceService from '../services/workspace.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const createWorkspace = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.createWorkspace(req.user.id, req.body);

  return res.status(201).json(
    new ApiResponse(201, 'Workspace created successfully', {
      workspace,
    })
  );
});

export const getUserWorkspaces = asyncHandler(async (req, res) => {
  const workspaces = await workspaceService.getUserWorkspaces(req.user.id);

  return res.status(200).json(
    new ApiResponse(200, 'Workspaces retrieved successfully', {
      workspaces,
    })
  );
});

export const getWorkspaceById = asyncHandler(async (req, res) => {
  const workspace = await workspaceService.getWorkspaceById(
    req.params.workspaceId,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      'Workspace retrieved successfully',
      {
        workspace,
      }
    )
  );
});

const workspaceController = {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceById,
};

export default workspaceController;
