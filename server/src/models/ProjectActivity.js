import mongoose from 'mongoose';

const projectActivitySchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    action: {
      type: String,
      required: true,
      enum: [
        'created',
        'updated',
        'status_changed',
        'member_added',
        'member_removed',
        'archived',
        'restored',
        'task_created',
        'task_updated',
        'task_archived',
        'task_restored',
        'task_status_changed',
      ],
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

projectActivitySchema.index({
  project: 1,
  createdAt: -1,
});

const ProjectActivity = mongoose.model('ProjectActivity', projectActivitySchema);

export default ProjectActivity;
