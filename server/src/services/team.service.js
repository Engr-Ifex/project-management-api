import ApiError from '../utils/ApiError.js';

export const getWorkspaceMembers = async (workspace) => {
  await workspace.populate({
    path: 'members.user',
    select: 'name email avatar',
  });

  return workspace.members;
};


export const removeWorkspaceMember = async (
  workspace,
  requestingMember,
  userId
) => {
  if (requestingMember.user.toString() === userId.toString()) {
    throw new ApiError(
      400,
      'You cannot remove yourself from the workspace'
    );
  }

  const memberIndex = workspace.members.findIndex(
    (member) =>
      member.user.toString() === userId.toString()
  );

  if (memberIndex === -1) {
    throw new ApiError(
      404,
      'User is not a member of this workspace'
    );
  }

  const member = workspace.members[memberIndex];

  if (member.role === 'owner') {
    throw new ApiError(
      403,
      'The workspace owner cannot be removed'
    );
  }

  // Admins can only remove members
  if (
    requestingMember.role === 'admin' &&
    member.role !== 'member'
  ) {
    throw new ApiError(
      403,
      'Admins can only remove regular members'
    );
  }

  workspace.members.splice(memberIndex, 1);

  await workspace.save();

  return member;
};