import * as projectService from '../services/project.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { hasProjectOverride } from '../constants/rolePermissions.js';

/*
 * Who is asking, for the two reads a plain workspace member can reach.
 *
 * The elevation rule lives in `hasProjectOverride`, shared with
 * `requireProjectPermission`, so the response shaping and the guard cannot
 * disagree about who counts as a workspace owner/admin.
 */
const viewerOf = (req) => ({
  userId: req.user._id,
  isWorkspaceElevated: hasProjectOverride(req.workspaceMember.role),
});

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
  const result = await projectService.getWorkspaceProjects(
    req.params.workspaceId,
    req.validatedQuery ?? {},
    viewerOf(req)
  );

  return res.status(200).json(new ApiResponse(200, 'Projects retrieved successfully', result));
});

export const getProjectById = asyncHandler(async (req, res) => {
  const project = await projectService.getProjectById(
    req.params.workspaceId,
    req.params.projectId,
    viewerOf(req)
  );

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

export const changeProjectMemberRoleController = asyncHandler(async (req, res) => {
  const { workspaceId, projectId, userId } = req.params;
  const { role } = req.body;

  const project = await projectService.changeProjectMemberRole(
    workspaceId,
    projectId,
    userId,
    role,
    req.user._id
  );

  return res.status(200).json(
    new ApiResponse(200, 'Project member role updated successfully', {
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
  changeProjectMemberRoleController,
};

export default projectController;
