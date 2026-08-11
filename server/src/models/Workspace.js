import mongoose from 'mongoose';
import { WORKSPACE_ROLES } from '../constants/workspaceRoles.js';

const workspaceMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Member user is required'],
    },

    role: {
      type: String,
      enum: Object.values(WORKSPACE_ROLES),
      default: WORKSPACE_ROLES.MEMBER,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Workspace name is required'],
      trim: true,
      minlength: [2, 'Workspace name must be at least 2 characters'],
      maxlength: [100, 'Workspace name cannot exceed 100 characters'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Workspace description cannot exceed 500 characters'],
      default: '',
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Workspace owner is required'],
      index: true,
    },

    members: {
      type: [workspaceMemberSchema],
      default: [],
    },

    settings: {
      allowMemberInvites: {
        type: Boolean,
        default: true,
      },

      isPublic: {
        type: Boolean,
        default: false,
      },
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,

    toJSON: {
      virtuals: true,
      versionKey: false,

      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;

        return ret;
      },
    },
  }
);

// ====================
// Indexes
// ====================

workspaceSchema.index({
  owner: 1,
  isArchived: 1,
});

workspaceSchema.index({
  'members.user': 1,
  isArchived: 1,
});

// ====================
// Static Methods
// ====================

// Find an active workspace by ID
workspaceSchema.statics.findActiveById = function (id) {
  return this.findOne({
    _id: id,
    isArchived: false,
  });
};

// Find all active workspaces a user belongs to
workspaceSchema.statics.findActiveByMember = function (userId) {
  return this.find({
    'members.user': userId,
    isArchived: false,
  });
};

const Workspace = mongoose.model('Workspace', workspaceSchema);

export default Workspace;
