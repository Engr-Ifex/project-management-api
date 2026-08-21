import { Router } from 'express';

import teamController from '../controllers/team.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';

import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';

import requireWorkspaceRole from '../middlewares/workspaceRole.middleware.js';

import validate from '../middlewares/validate.middleware.js';

import {
  inviteMemberSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
  transferOwnershipSchema,
} from '../validators/team.validator.js';
import requireWorkspacePermission from '../middlewares/requireWorkspacePermission.middleware.js';

import { WORKSPACE_PERMISSIONS } from '../constants/workspacePermissions.js';

import { WORKSPACE_ROLES } from '../constants/workspaceRoles.js';
import { workspaceIdSchema } from '../validators/workspace.validator.js';

const router = Router();

router.post(
  '/workspaces/:workspaceId/invitations',
  authenticate,
  validate(inviteMemberSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.INVITE_MEMBERS),
  teamController.inviteMember
);

router.patch('/invitations/:token/accept', authenticate, teamController.acceptInvitation);

router.get(
  '/workspaces/:workspaceId/members',
  authenticate,
  validate(workspaceIdSchema),
  requireWorkspaceMember,
  teamController.getWorkspaceMembers
);

router.delete(
  '/workspaces/:workspaceId/members/:userId',
  authenticate,
  validate(removeMemberSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.REMOVE_MEMBERS),
  teamController.removeWorkspaceMember
);

router.patch(
  '/workspaces/:workspaceId/members/:userId/role',
  authenticate,
  validate(updateMemberRoleSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.CHANGE_ROLES),
  teamController.updateMemberRole
);

router.patch(
  '/workspaces/:workspaceId/transfer-ownership',
  authenticate,
  validate(transferOwnershipSchema),
  requireWorkspaceMember,
  requireWorkspacePermission(WORKSPACE_PERMISSIONS.TRANSFER_OWNERSHIP),
  teamController.transferOwnership
);

export default router;
