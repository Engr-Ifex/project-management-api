import crypto from 'crypto';

import Invitation from '../models/Invitation.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import ApiError from '../utils/ApiError.js';

export const createInvitation = async (workspace, userId, { email, role }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if the user already exists in the workspace
  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    const alreadyMember = workspace.members.some(
      (member) => member.user.toString() === existingUser._id.toString()
    );

    if (alreadyMember) {
      throw new ApiError(409, 'User is already a member of this workspace');
    }
  }

  // Check for an existing pending invitation
  const existingInvitation = await Invitation.findOne({
    workspace: workspace._id,
    email: normalizedEmail,
    status: 'pending',
  });

  if (existingInvitation) {
    throw new ApiError(409, 'A pending invitation already exists for this email');
  }

  // Generate invitation token
  const token = crypto.randomBytes(32).toString('hex');

  // Invitation expires after 48 hours
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const invitation = await Invitation.create({
    workspace: workspace._id,
    invitedBy: userId,
    email: normalizedEmail,
    role,
    token,
    expiresAt,
  });

  return invitation;
};

export const acceptInvitation = async (token, userId) => {
  const invitation = await Invitation.findOne({
    token,
    status: 'pending',
  });

  if (!invitation) {
    throw new ApiError(404, 'Invitation not found or no longer valid');
  }

  // Check expiration
  if (invitation.expiresAt < new Date()) {
    invitation.status = 'expired';

    await invitation.save();

    throw new ApiError(410, 'Invitation has expired');
  }

  // Find the logged-in user
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Make sure the invitation was sent to this user's email
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new ApiError(403, 'This invitation was not sent to your email address');
  }

  // Find workspace
  const workspace = await Workspace.findById(invitation.workspace);

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  // Make sure user isn't already a member
  const alreadyMember = workspace.members.some(
    (member) => member.user.toString() === userId.toString()
  );

  if (alreadyMember) {
    throw new ApiError(409, 'You are already a member of this workspace');
  }

  // Add user to workspace
  workspace.members.push({
    user: userId,
    role: invitation.role,
    joinedAt: new Date(),
  });

  await workspace.save();

  // Mark invitation as accepted
  invitation.status = 'accepted';
  invitation.acceptedAt = new Date();

  await invitation.save();

  return {
    workspace,
    invitation,
  };
};
