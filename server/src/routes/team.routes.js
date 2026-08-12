import { Router } from 'express';

import teamController from '../controllers/team.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';

import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';

import requireWorkspaceRole from '../middlewares/workspaceRole.middleware.js';

import validate from '../middlewares/validate.middleware.js';

import {
  inviteMemberSchema,
  removeMemberSchema,
} from '../validators/team.validator.js';

import { WORKSPACE_ROLES } from '../constants/workspaceRoles.js';
import { workspaceIdSchema } from '../validators/workspace.validator.js';


const router = Router();

router.post(
  '/workspaces/:workspaceId/invitations',
  authenticate,
  validate(inviteMemberSchema),
  requireWorkspaceMember,
  requireWorkspaceRole(WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN),
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
  requireWorkspaceRole(
    WORKSPACE_ROLES.OWNER,
    WORKSPACE_ROLES.ADMIN
  ),
  teamController.removeWorkspaceMember
);

export default router;
