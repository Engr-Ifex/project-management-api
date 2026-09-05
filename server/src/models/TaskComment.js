import mongoose from 'mongoose';

const taskCommentSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      minlength: [
        1,
        'Comment cannot be empty',
      ],
      maxlength: [
        2000,
        'Comment cannot exceed 2000 characters',
      ],
    },
  },
  {
    timestamps: true,
  }
);

taskCommentSchema.index({
  task: 1,
  createdAt: 1,
});

const TaskComment = mongoose.model(
  'TaskComment',
  taskCommentSchema
);

export default TaskComment;