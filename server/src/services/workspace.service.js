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

  const isMember = workspace.members.some(
    (member) => member.user.toString() === userId.toString()
  );

  if (!isMember) {
    throw new ApiError(
      403,
      'You do not have access to this workspace'
    );
  }

  return workspace;
};

const workspaceService = {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceById,
};

export default workspaceService;
