import mongoose from 'mongoose';

/*
 * Audit records are append-only. Marking the fields immutable means Mongoose
 * will not persist modifications to an already-created record, so no code
 * path (and no future service) can rewrite audit history.
 */
const auditField = (definition) => ({
  ...definition,
  immutable: true,
});

const projectActivitySchema = new mongoose.Schema(
  {
    workspace: auditField({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    }),

    project: auditField({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    }),

    user: auditField({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    }),

    action: auditField({
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

        // Subtask actions
        'subtask_created',
        'subtask_updated',
        'subtask_deleted',

        // Task comment actions
        'task_comment_added',
        'task_comment_updated',
        'task_comment_deleted',

        // Label actions
        'label_created',
        'label_updated',
        'label_deleted',
        'label_assigned',
        'label_removed',
      ],
    }),

    /*
     * Structured metadata convention:
     *   - entity ids are camelCase: taskId, subtaskId, commentId, labelId, memberId
     *   - changed field names go in `fields` (array) or `field` (single)
     *   - value transitions go in `from` / `to`
     *   - human readable names are optional extras (taskTitle, name)
     */
    metadata: auditField({
      type: mongoose.Schema.Types.Mixed,
      default: {},
    }),
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

// Actor based lookups ("what did this user do in this project").
projectActivitySchema.index({
  project: 1,
  user: 1,
  createdAt: -1,
});

const ProjectActivity = mongoose.model('ProjectActivity', projectActivitySchema);

export default ProjectActivity;
