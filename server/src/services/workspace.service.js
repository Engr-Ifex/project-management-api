import Workspace from '../models/Workspace.js';
// import ApiError from '../utils/ApiError.js';

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

const workspaceService = {
  createWorkspace,
  getUserWorkspaces,
};

export default workspaceService;
