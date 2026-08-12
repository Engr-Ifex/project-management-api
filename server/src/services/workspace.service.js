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

export const getWorkspaceById = async (workspace) => {
  return workspace;
};

export const updateWorkspace = async (workspace, workspaceData) => {
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

export const archiveWorkspace = async (workspace) => {
  workspace.isArchived = true;
  workspace.archivedAt = new Date();

  await workspace.save();

  return workspace;
};

export const restoreWorkspace = async (workspace) => {
  workspace.isArchived = false;
  workspace.archivedAt = null;

  await workspace.save();

  return workspace;
};

export const deleteWorkspace = async (workspace) => {
  await workspace.deleteOne();
};

const workspaceService = {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  archiveWorkspace,
  restoreWorkspace,
  deleteWorkspace,
};

export default workspaceService;
