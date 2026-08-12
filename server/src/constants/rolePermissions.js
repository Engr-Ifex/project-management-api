import { WORKSPACE_ROLES } from './workspaceRoles.js';

export const ROLE_HIERARCHY = Object.freeze({
  [WORKSPACE_ROLES.OWNER]: 3,
  [WORKSPACE_ROLES.ADMIN]: 2,
  [WORKSPACE_ROLES.MEMBER]: 1,
});

export const hasHigherRole = (requesterRole, targetRole) => {
  return ROLE_HIERARCHY[requesterRole] > ROLE_HIERARCHY[targetRole];
};

export const hasEqualOrHigherRole = (requesterRole, targetRole) => {
  return ROLE_HIERARCHY[requesterRole] >= ROLE_HIERARCHY[targetRole];
};

export const isValidWorkspaceRole = (role) => {
  return Object.values(WORKSPACE_ROLES).includes(role);
};
