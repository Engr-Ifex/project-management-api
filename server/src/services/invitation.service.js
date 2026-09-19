import crypto from 'crypto';

import Invitation from '../models/Invitation.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import ApiError from '../utils/ApiError.js';
import { runAtomically } from '../utils/transactions.js';
import { notifyWorkspaceInvitation } from './notification.service.js';

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

  /*
   * The pre-check above handles the ordinary case; the unique index on
   * `{workspace, email}` restricted to pending invitations is what handles the
   * concurrent one, where both requests pass the check before either inserts.
   * The duplicate-key error is translated here so the caller gets the same
   * message the pre-check produces, rather than the generic one the error
   * middleware derives from the key name.
   */
  let invitation;

  try {
    invitation = await Invitation.create({
      workspace: workspace._id,
      invitedBy: userId,
      email: normalizedEmail,
      role,
      token,
      expiresAt,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'A pending invitation already exists for this email');
    }

    throw error;
  }

  /*
   * If the invitee already has an account, notify them in-app as well.
   * Invitees without an account can only be reached by the invitation email.
   */
  if (existingUser) {
    await notifyWorkspaceInvitation({
      workspaceId: workspace._id,
      actorId: userId,
      recipientId: existingUser._id,
      workspaceName: workspace.name,
      role,
    });
  }

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

  /*
   * Grant the membership and consume the invitation.
   *
   * The membership is added with a conditional update rather than a
   * read-modify-write. `'members.user': { $ne: userId }` is evaluated by the
   * database as part of the write, so two concurrent accepts of the same
   * invitation cannot both pass a check and both push a member. The previous
   * version read the workspace, tested the array in memory and saved the whole
   * array, which allowed a duplicate membership — and a duplicate member is a
   * real defect, not a cosmetic one: two entries for one user make the role
   * they hold ambiguous.
   *
   * The two writes are wrapped in a transaction where the deployment supports
   * one, so a failure between them cannot leave a member holding an invitation
   * that is still pending. On a standalone server they run in sequence; the
   * invariant still holds there, because it is enforced by the conditional
   * update itself and not by the rollback — see `src/utils/transactions.js`.
   */
  const workspace = await runAtomically(async (session) => {
    const updated = await Workspace.findOneAndUpdate(
      {
        _id: invitation.workspace,
        'members.user': { $ne: userId },
      },
      {
        $push: {
          members: {
            user: userId,
            role: invitation.role,
            joinedAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true, ...(session ? { session } : {}) }
    );

    if (!updated) {
      /*
       * Nothing matched: either the workspace is gone, or the user is already a
       * member — possibly because a concurrent request has just added them.
       * Re-read so the caller gets the accurate error.
       */
      const existing = await Workspace.findById(invitation.workspace);

      if (!existing) {
        throw new ApiError(404, 'Workspace not found');
      }

      throw new ApiError(409, 'You are already a member of this workspace');
    }

    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();

    await invitation.save(session ? { session } : undefined);

    return updated;
  });

  return {
    workspace,
    invitation,
  };
};
