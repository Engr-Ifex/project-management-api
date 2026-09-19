import mongoose from 'mongoose';
import { WORKSPACE_ROLES } from '../constants/workspaceRoles.js';

const invitationSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    role: {
      type: String,
      enum: [WORKSPACE_ROLES.ADMIN, WORKSPACE_ROLES.MEMBER],
      default: WORKSPACE_ROLES.MEMBER,
    },

    token: {
      type: String,
      required: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'cancelled'],
      default: 'pending',
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * One pending invitation per (workspace, email).
 *
 * This is both the lookup index `createInvitation` needs and the integrity
 * constraint that backs it. The service checks for an existing pending
 * invitation before creating another, but a check-then-insert is a race: two
 * concurrent requests both see nothing and both insert. The partial unique
 * index makes the second insert fail, which the error middleware maps to 409.
 *
 * `partialFilterExpression` is what keeps it correct. A plain unique index over
 * `{workspace, email}` would forbid re-inviting someone after their invitation
 * was accepted, expired or cancelled — the case the service explicitly allows.
 * Restricting the constraint to `status: 'pending'` means only a *live*
 * duplicate is rejected.
 *
 * The index also serves the query, which filters on exactly this triple: for
 * pending documents the partial filter supplies `status`, so the `workspace`
 * and `email` keys are enough.
 *
 * OPERATIONAL NOTE. Creating a unique index fails if the collection already
 * contains duplicates. Check before deploying:
 *
 *   db.invitations.aggregate([
 *     { $match: { status: 'pending' } },
 *     { $group: { _id: { workspace: '$workspace', email: '$email' }, n: { $sum: 1 } } },
 *     { $match: { n: { $gt: 1 } } },
 *   ])
 *
 * Any row it returns is a duplicate the race already produced — cancel all but
 * the newest before building the index.
 */
invitationSchema.index(
  {
    workspace: 1,
    email: 1,
  },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'one_pending_invitation_per_email',
  }
);

const Invitation = mongoose.model('Invitation', invitationSchema);

export default Invitation;
