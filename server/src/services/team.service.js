import Workspace from '../models/Workspace.js';
import ApiError from '../utils/ApiError.js';
import { WORKSPACE_ROLES } from '../constants/workspaceRoles.js';

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

  /*
   * Remove atomically, guarded on the target still being a non-owner member.
   *
   * `$elemMatch` is required rather than two dotted conditions: `'members.user'`
   * and `'members.role'` would be satisfied by two DIFFERENT elements, so a
   * workspace containing the target as a member and a separate owner would pass
   * a guard that was meant to protect the owner. Saving the whole array back
   * would also discard a concurrent change to any other member.
   */
  const updated = await Workspace.findOneAndUpdate(
    {
      _id: workspace._id,
      members: {
        $elemMatch: {
          user: userId,
          role: { $ne: WORKSPACE_ROLES.OWNER },
        },
      },
    },
    { $pull: { members: { user: userId } } },
    { new: true }
  );

  if (!updated) {
    throw new ApiError(404, 'User is not a member of this workspace');
  }

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

  /*
   * Change the role atomically, addressing the element by `arrayFilters`
   * rather than rewriting the array from a copy. Saving the whole array back
   * would silently discard a concurrent change to any other member.
   */
  const updated = await Workspace.findOneAndUpdate(
    {
      _id: workspace._id,
      'members.user': userId,
    },
    { $set: { 'members.$[target].role': newRole } },
    { new: true, arrayFilters: [{ 'target.user': userId }] }
  );

  if (!updated) {
    throw new ApiError(404, 'User is not a member of this workspace');
  }

  return updated.members.find((member) => member.user.toString() === userId.toString());
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

  /*
   * Swap both roles and the owner field in a single conditional update.
   *
   * All three fields live in one document, so one update is atomic and there is
   * no intermediate state with two owners or none. The `owner` condition makes
   * it a compare-and-swap: if a concurrent transfer has already moved
   * ownership, this one matches nothing and reports a conflict instead of
   * overwriting the winner.
   *
   * `arrayFilters` is what allows two DIFFERENT array elements to be updated in
   * the same operation. Doing it as two writes would leave a window in which
   * two members both hold the owner role — which the authorization layer reads
   * from exactly this array.
   */
  const updated = await Workspace.findOneAndUpdate(
    {
      _id: workspace._id,
      owner: requestingMember.user,
      'members.user': newOwnerId,
    },
    {
      $set: {
        owner: newOwnerId,
        'members.$[previous].role': WORKSPACE_ROLES.ADMIN,
        'members.$[next].role': WORKSPACE_ROLES.OWNER,
      },
    },
    {
      new: true,
      arrayFilters: [{ 'previous.user': requestingMember.user }, { 'next.user': newOwnerId }],
    }
  );

  if (!updated) {
    throw new ApiError(409, 'Ownership has already been transferred');
  }

  const memberOf = (id) =>
    updated.members.find((member) => member.user.toString() === id.toString());

  return {
    previousOwner: memberOf(requestingMember.user),
    newOwner: memberOf(newOwnerId),
  };
};
