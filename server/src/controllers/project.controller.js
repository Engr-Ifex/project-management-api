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

export const getWorkspaceProjects = asyncHandler(async (req, res) => {
  const projects = await projectService.getWorkspaceProjects(req.params.workspaceId);

  return res.status(200).json(
    new ApiResponse(200, 'Projects retrieved successfully', {
      projects,
    })
  );
});

export const getProjectById = asyncHandler(async (req, res) => {
  const project = await projectService.getProjectById(req.params.workspaceId, req.params.projectId);

  return res.status(200).json(
    new ApiResponse(200, 'Project retrieved successfully', {
      project,
    })
  );
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await projectService.updateProject(
    req.params.workspaceId,
    req.params.projectId,
    req.body,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Project updated successfully', {
      project,
    })
  );
});

export const archiveProject = asyncHandler(async (req, res) => {
  const project = await projectService.archiveProject(
    req.params.workspaceId,
    req.params.projectId,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Project archived successfully', {
      project,
    })
  );
});

export const restoreProject = asyncHandler(async (req, res) => {
  const project = await projectService.restoreProject(
    req.params.workspaceId,
    req.params.projectId,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Project restored successfully', {
      project,
    })
  );
});
export const updateProjectStatus = asyncHandler(async (req, res) => {
  const project = await projectService.updateProjectStatus(
    req.params.workspaceId,
    req.params.projectId,
    req.body.status,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Project status updated successfully', {
      project,
    })
  );
});

export const addProjectMember = asyncHandler(async (req, res) => {
  const project = await projectService.addProjectMember(
    req.params.workspaceId,
    req.params.projectId,
    req.body.userId,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Project member added successfully', {
      project,
    })
  );
});
export const removeProjectMember = asyncHandler(async (req, res) => {
  const project = await projectService.removeProjectMember(
    req.params.workspaceId,
    req.params.projectId,
    req.params.userId,
    req.user.id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Project member removed successfully', {
      project,
    })
  );
});

const projectController = {
  createProject,
  getWorkspaceProjects,
  getProjectById,
  updateProject,
  archiveProject,
  restoreProject,
  updateProjectStatus,
  addProjectMember,
  removeProjectMember,
};

export default projectController;
