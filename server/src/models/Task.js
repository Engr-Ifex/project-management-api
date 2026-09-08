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
      index: true,
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
    estimatedTime: {
      type: Number,
      default: 0,
      min: [0, 'Estimated time cannot be negative'],
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

const Task = mongoose.model('Task', taskSchema);

export default Task;
