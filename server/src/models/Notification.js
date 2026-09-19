import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Who caused the event. Null for system-generated notifications.
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    type: {
      type: String,
      required: true,
      enum: Object.values(NOTIFICATION_TYPES),
    },

    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [200, 'Notification title cannot exceed 200 characters'],
    },

    message: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'Notification message cannot exceed 1000 characters'],
    },

    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },

    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskComment',
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unread notifications for a recipient, newest first.
notificationSchema.index({
  recipient: 1,
  isRead: 1,
  createdAt: -1,
});

// All notifications for a recipient, newest first.
notificationSchema.index({
  recipient: 1,
  createdAt: -1,
});

// Supports de-duplication of recurring notifications (e.g. task due soon).
notificationSchema.index({
  recipient: 1,
  type: 1,
  task: 1,
});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
