import ApiError from '../utils/ApiError.js';
import { WORKSPACE_ROLES } from '../constants/workspaceRoles.js';
import { hasHigherRole } from '../constants/rolePermissions.js';

export const getWorkspaceMembers = async (workspace) => {
  await workspace.populate({
    path: 'members.user',
    select: 'name email avatar',
  });

  return workspace.members;
};

export const removeWorkspaceMember = async (workspace, requestingMember, userId) => {
  if (requestingMember.user.toString() === userId.toString()) {
    throw new ApiError(400, 'You cannot remove yourself from the workspace');
  }

  const memberIndex = workspace.members.findIndex(
    (member) => member.user.toString() === userId.toString()
  );

  if (memberIndex === -1) {
    throw new ApiError(404, 'User is not a member of this workspace');
  }

  const member = workspace.members[memberIndex];

  if (member.role === 'owner') {
    throw new ApiError(403, 'The workspace owner cannot be removed');
  }

  // Admins can only remove members
  if (requestingMember.role === 'admin' && member.role !== 'member') {
    throw new ApiError(403, 'Admins can only remove regular members');
  }

  workspace.members.splice(memberIndex, 1);

  await workspace.save();

  return member;
};

export const updateMemberRole = async (workspace, requestingMember, userId, newRole) => {
  const targetMember = workspace.members.find(
    (member) => member.user.toString() === userId.toString()
  );

  if (!targetMember) {
    throw new ApiError(404, 'User is not a member of this workspace');
  }

  // Owner cannot have their role changed here
  if (targetMember.role === WORKSPACE_ROLES.OWNER) {
    throw new ApiError(403, 'The workspace owner role cannot be changed');
  }

  // Admins cannot change roles
  if (requestingMember.role !== WORKSPACE_ROLES.OWNER) {
    throw new ApiError(403, 'Only the workspace owner can change member roles');
  }

  // Prevent changing your own role
  if (requestingMember.user.toString() === userId.toString()) {
    throw new ApiError(400, 'You cannot change your own role');
  }

  targetMember.role = newRole;

  await workspace.save();

  return targetMember;
};

export const transferOwnership = async (workspace, requestingMember, newOwnerId) => {
  // Only the current owner can transfer ownership
  if (requestingMember.role !== WORKSPACE_ROLES.OWNER) {
    throw new ApiError(403, 'Only the workspace owner can transfer ownership');
  }

  // Prevent transferring to yourself
  if (requestingMember.user.toString() === newOwnerId.toString()) {
    throw new ApiError(400, 'You are already the workspace owner');
  }

  // Find the new owner
  const newOwner = workspace.members.find(
    (member) => member.user.toString() === newOwnerId.toString()
  );

  if (!newOwner) {
    throw new ApiError(404, 'User is not a member of this workspace');
  }

  // Find current owner
  const currentOwner = workspace.members.find((member) => member.role === WORKSPACE_ROLES.OWNER);

  if (!currentOwner) {
    throw new ApiError(500, 'Workspace does not have a valid owner');
  }

  // Transfer ownership
  currentOwner.role = WORKSPACE_ROLES.ADMIN;
  newOwner.role = WORKSPACE_ROLES.OWNER;

  // Update workspace owner field if your model has one
  workspace.owner = newOwner.user;

  await workspace.save();

  return {
    previousOwner: currentOwner,
    newOwner,
  };
};
