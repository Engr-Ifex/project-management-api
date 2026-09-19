import mongoose from 'mongoose';

const subtaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Subtask title is required'],
      trim: true,
      minlength: [1, 'Subtask title cannot be empty'],
      maxlength: [200, 'Subtask title cannot exceed 200 characters'],
    },

    isCompleted: {
      type: Boolean,
      default: false,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const taskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      minlength: [2, 'Task title must be at least 2 characters'],
      maxlength: [200, 'Task title cannot exceed 200 characters'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Task description cannot exceed 5000 characters'],
      default: '',
    },

    subtasks: {
      type: [subtaskSchema],
      default: [],
    },

    /*
     * Labels are referenced, never duplicated.
     * A label belongs to a project and may be attached to many tasks
     * within that project.
     */
    labels: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Label',
        },
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ['todo', 'in_progress', 'in_review', 'completed', 'cancelled'],
      default: 'todo',
    },

    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },

    startDate: {
      type: Date,
      default: null,
    },

    dueDate: {
      type: Date,
      default: null,
    },
    /*
     * Estimated effort, always expressed as a whole number of minutes.
     *
     * The unit is fixed by contract rather than stored per task, so every
     * consumer — API responses and dashboard totals alike — can interpret the
     * value without an extra lookup. `0` means "no estimate recorded yet".
     *
     * The integer check mirrors the Zod rules on the create/update schemas so
     * the contract holds even for a write that bypasses request validation.
     */
    estimatedTime: {
      type: Number,
      default: 0,
      min: [0, 'Estimated time cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Estimated time must be a whole number of minutes',
      },
    },

    position: {
      type: Number,
      default: 0,
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

taskSchema.index({
  project: 1,
  isArchived: 1,
  position: 1,
});

taskSchema.index({
  project: 1,
  status: 1,
});

taskSchema.index({
  project: 1,
  priority: 1,
});

// Tasks carrying a given label within a project.
taskSchema.index({
  project: 1,
  labels: 1,
});

/*
 * Newest-first task listing within a project. The default sort stays
 * `position`, but a client can ask for `sortBy=createdAt`, which the
 * position-ordered index cannot serve.
 */
taskSchema.index({
  project: 1,
  isArchived: 1,
  createdAt: -1,
});

// Filtering a project's tasks by assignee (`?assignee=<id>`).
taskSchema.index({
  project: 1,
  assignee: 1,
});

// Due-date range filtering (`dueDateFrom` / `dueDateTo`) and due-date sorting.
taskSchema.index({
  project: 1,
  dueDate: 1,
});

/*
 * Start-date range filtering (`startDateFrom` / `startDateTo`).
 *
 * The sibling of the due-date index above. Task listing supports the same
 * from/to pair on both dates, so without this one the start-date half of that
 * feature scans every task in the project while the due-date half is indexed.
 */
taskSchema.index({
  project: 1,
  startDate: 1,
});

/*
 * "My tasks" lookups: every task assigned to a user, optionally narrowed to
 * live ones. The dashboard's user-focused statistics match on exactly this
 * pair, and without the index they would scan the whole tasks collection —
 * which grows with every task in the system, not just the caller's.
 */
taskSchema.index({
  assignee: 1,
  isArchived: 1,
});

const Task = mongoose.model('Task', taskSchema);

export default Task;
