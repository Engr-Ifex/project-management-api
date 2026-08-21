import mongoose from 'mongoose';

const projectMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const projectSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      minlength: [2, 'Project name must be at least 2 characters'],
      maxlength: [100, 'Project name cannot exceed 100 characters'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Project description cannot exceed 2000 characters'],
      default: '',
    },

    status: {
      type: String,
      enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
      default: 'planning',
    },

    deadline: {
      type: Date,
      default: null,
    },

    color: {
      type: String,
      trim: true,
      default: null,
    },

    members: {
      type: [projectMemberSchema],
      default: [],
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

    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

projectSchema.index({
  workspace: 1,
  isArchived: 1,
});

projectSchema.index({
  workspace: 1,
  status: 1,
});

const Project = mongoose.model('Project', projectSchema);

export default Project;
