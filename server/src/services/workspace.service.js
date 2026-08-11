import Workspace from '../models/Workspace.js';
import ApiError from '../utils/ApiError.js';

export const createWorkspace = async (userId, workspaceData) => {
  const { name, description } = workspaceData;

  const workspace = await Workspace.create({
    name,
    description,
    owner: userId,

    members: [
      {
        user: userId,
        role: 'owner',
      },
    ],
  });

  return workspace;
};

export const getUserWorkspaces = async (userId) => {
  const workspaces = await Workspace.findActiveByMember(userId);

  return workspaces;
};

export const getWorkspaceById = async (workspaceId, userId) => {
  const workspace = await Workspace.findActiveById(workspaceId);

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  const isMember = workspace.members.some((member) => member.user.toString() === userId.toString());

  if (!isMember) {
    throw new ApiError(403, 'You do not have access to this workspace');
  }

  return workspace;
};

export const updateWorkspace = async (workspaceId, userId, workspaceData) => {
  const workspace = await Workspace.findActiveById(workspaceId);

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  const isMember = workspace.members.some((member) => member.user.toString() === userId.toString());

  if (!isMember) {
    throw new ApiError(403, 'You do not have access to this workspace');
  }

  const { name, description } = workspaceData;

  if (name !== undefined) {
    workspace.name = name;
  }

  if (description !== undefined) {
    workspace.description = description;
  }

  await workspace.save();

  return workspace;
};

export const archiveWorkspace = async (workspaceId, userId) => {
  const workspace = await Workspace.findActiveById(workspaceId);

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  const isMember = workspace.members.some((member) => member.user.toString() === userId.toString());

  if (!isMember) {
    throw new ApiError(403, 'You do not have access to this workspace');
  }

  workspace.isArchived = true;
  workspace.archivedAt = new Date();

  await workspace.save();

  return workspace;
};

const workspaceService = {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  archiveWorkspace,
};

export default workspaceService;
