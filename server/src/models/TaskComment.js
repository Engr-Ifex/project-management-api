import mongoose from 'mongoose';

const taskCommentSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      minlength: [1, 'Comment cannot be empty'],
      maxlength: [2000, 'Comment cannot exceed 2000 characters'],
    },

    editedAt: {
      type: Date,
      default: null,
    },

    // Soft-delete mechanism, consistent with the User model
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Primary read pattern: active comments for a task, oldest first.
taskCommentSchema.index({
  task: 1,
  isDeleted: 1,
  createdAt: 1,
});

// Project-level lookups (e.g. activity feeds / future comment history).
taskCommentSchema.index({
  project: 1,
  isDeleted: 1,
});

// Author-level lookups (e.g. "my comments").
taskCommentSchema.index({
  author: 1,
  isDeleted: 1,
});

const TaskComment = mongoose.model('TaskComment', taskCommentSchema);

export default TaskComment;
