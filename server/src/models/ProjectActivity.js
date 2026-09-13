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
        // Project actions
        'created',
        'updated',
        'status_changed',
        'member_added',
        'member_removed',
        'member_role_changed',
        'archived',
        'restored',

        // Task actions
        'task_created',
        'task_updated',
        'task_archived',
        'task_restored',
        'task_status_changed',
        'task_priority_changed',
        'task_assigned',
        'task_reassigned',
        'task_unassigned',

        // Task comment actions
        'task_comment_added',
        'task_comment_updated',
        'task_comment_deleted',
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

projectActivitySchema.index({
  project: 1,
  'metadata.taskId': 1,
  createdAt: -1,
});

const ProjectActivity = mongoose.model('ProjectActivity', projectActivitySchema);

export default ProjectActivity;
