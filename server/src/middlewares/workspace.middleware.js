import Workspace from '../models/Workspace.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const requireWorkspaceMember = asyncHandler(async (req, res, next) => {
  const { workspaceId } = req.params;

  const workspace = await Workspace.findActiveById(workspaceId);

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  const member = workspace.members.find(
    (member) => member.user.toString() === req.user.id.toString()
  );

  if (!member) {
    throw new ApiError(403, 'You do not have access to this workspace');
  }

  req.workspace = workspace;
  req.workspaceMember = member;

  next();
});

export const requireArchivedWorkspaceMember = asyncHandler(async (req, res, next) => {
  const { workspaceId } = req.params;

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    isArchived: true,
  });

  if (!workspace) {
    throw new ApiError(404, 'Archived workspace not found');
  }

  const member = workspace.members.find(
    (member) => member.user.toString() === req.user.id.toString()
  );

  if (!member) {
    throw new ApiError(403, 'You do not have access to this workspace');
  }

  req.workspace = workspace;
  req.workspaceMember = member;

  next();
});

export const requireWorkspaceMemberAnyState = asyncHandler(async (req, res, next) => {
  const { workspaceId } = req.params;

  const workspace = await Workspace.findById(workspaceId);

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  const member = workspace.members.find(
    (member) => member.user.toString() === req.user.id.toString()
  );

  if (!member) {
    throw new ApiError(403, 'You do not have access to this workspace');
  }

  req.workspace = workspace;
  req.workspaceMember = member;

  next();
});
