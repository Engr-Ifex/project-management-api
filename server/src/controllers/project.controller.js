import * as projectService from '../services/project.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const createProject = asyncHandler(async (req, res) => {
  const project = await projectService.createProject(
    req.params.workspaceId,
    req.user._id,
    req.body
  );

  return res.status(201).json(
    new ApiResponse(201, 'Project created successfully', {
      project,
    })
  );
});

const projectController = {
  createProject,
};

export default projectController;
