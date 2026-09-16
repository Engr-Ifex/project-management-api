import mongoose from 'mongoose';

import { ATTACHMENT_SCOPES } from '../constants/attachment.js';

/*
 * Storage descriptor.
 *
 * `provider` records which backend holds the binary, `key` is that backend's
 * opaque identifier, and `bucket`/`container` is reserved for cloud providers.
 * Keeping this on the record means a row is self-describing: given an
 * attachment you always know where the bytes live and how to fetch them.
 */
const storageSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ['local'],
      default: 'local',
    },

    key: {
      type: String,
      required: true,
    },

    bucket: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const attachmentSchema = new mongoose.Schema(
  {
    /*
     * The name the uploader's file had. Sanitised before storage, but still
     * untrusted: it is only ever echoed back to clients, never used to build
     * a filesystem path.
     */
    originalFilename: {
      type: String,
      required: [true, 'Original filename is required'],
      trim: true,
      maxlength: [200, 'Original filename cannot exceed 200 characters'],
    },

    // Generated name (UUID + validated extension). Never derived from user input.
    storedFilename: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
    },

    size: {
      type: Number,
      required: true,
      min: [0, 'Size cannot be negative'],
    },

    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },

    /*
     * Exactly one owner scope applies. A project-level attachment has neither
     * `task` nor `comment`; a task attachment sets `task`; a comment attachment
     * sets `comment` (and `task`, so comment files are still reachable from the
     * task they belong to).
     */
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true,
    },

    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskComment',
      default: null,
      index: true,
    },

    scope: {
      type: String,
      required: true,
      enum: Object.values(ATTACHMENT_SCOPES),
      default: ATTACHMENT_SCOPES.PROJECT,
    },

    storage: {
      type: storageSchema,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Project attachment listing, newest first.
attachmentSchema.index({
  project: 1,
  createdAt: -1,
});

// Task attachment listing.
attachmentSchema.index({
  task: 1,
  createdAt: -1,
});

// Comment attachment listing.
attachmentSchema.index({
  comment: 1,
  createdAt: -1,
});

/*
 * A stored object must back exactly one record, so a duplicate write can never
 * orphan a file or double-count it.
 */
attachmentSchema.index(
  {
    'storage.key': 1,
  },
  {
    unique: true,
  }
);

const Attachment = mongoose.model('Attachment', attachmentSchema);

export default Attachment;
