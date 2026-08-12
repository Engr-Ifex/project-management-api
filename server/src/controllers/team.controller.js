import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import * as invitationService from '../services/invitation.service.js';
import * as teamService from '../services/team.service.js';

export const inviteMember = asyncHandler(async (req, res) => {
  const invitation = await invitationService.createInvitation(req.workspace, req.user.id, req.body);

  return res.status(201).json(
    new ApiResponse(201, 'Invitation created successfully', {
      invitation,
    })
  );
});

export const acceptInvitation = asyncHandler(async (req, res) => {
  const result = await invitationService.acceptInvitation(req.params.token, req.user.id);

  return res.status(200).json(
    new ApiResponse(200, 'Invitation accepted successfully', {
      workspace: result.workspace,
    })
  );
});

export const getWorkspaceMembers = asyncHandler(async (req, res) => {
  const members = await teamService.getWorkspaceMembers(req.workspace);

  return res.status(200).json(
    new ApiResponse(200, 'Workspace members retrieved successfully', {
      members,
    })
  );
});

export const removeWorkspaceMember = asyncHandler(async (req, res) => {
  await teamService.removeWorkspaceMember(req.workspace, req.workspaceMember, req.params.userId);

  return res.status(200).json(new ApiResponse(200, 'Workspace member removed successfully'));
});

export const updateMemberRole = asyncHandler(async (req, res) => {
  const member = await teamService.updateMemberRole(
    req.workspace,
    req.workspaceMember,
    req.params.userId,
    req.body.role
  );

  return res.status(200).json(
    new ApiResponse(200, 'Member role updated successfully', {
      member,
    })
  );
});

const teamController = {
  inviteMember,
  acceptInvitation,
  getWorkspaceMembers,
  removeWorkspaceMember,
  updateMemberRole,
};

export default teamController;
