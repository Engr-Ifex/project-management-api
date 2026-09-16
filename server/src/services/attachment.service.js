import Attachment from '../models/Attachment.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import TaskComment from '../models/TaskComment.js';

import ApiError from '../utils/ApiError.js';
import { getSafeExtension, sanitizeOriginalFilename } from '../utils/filename.js';
import { buildSort, findPaginated } from '../utils/query.js';

import { ATTACHMENT_DEFAULT_SORT, ATTACHMENT_SORT_FIELDS } from '../constants/query.js';

import { getStorageProvider, STORAGE_PROVIDERS } from '../storage/storageProvider.js';

import { createProjectActivity } from './projectActivity.service.js';

import PROJECT_PERMISSIONS from '../constants/projectPermission.js';
import { hasProjectPermission } from '../constants/projectRolePermissions.js';
import {
  ATTACHMENT_SCOPES,
  isAllowedMimeType,
  isBlockedExtension,
  isExtensionAllowedForMimeType,
} from '../constants/attachment.js';

/*
 * Fields safe to expose for the uploader reference.
 * `password` is `select: false` on the User model and is never returned.
 */
const UPLOADER_FIELDS = 'name email avatar';

/*
 * The active provider. Every filesystem concern goes through it, so swapping
 * to cloud storage later is a one-line change here (or an env-driven lookup)
 * with no edits to the logic below.
 */
const storageProvider = getStorageProvider(STORAGE_PROVIDERS.LOCAL);

/* ================================================================== *
 * Guards
 * ================================================================== */

/**
 * Load an active project inside a workspace, or fail with a 404.
 */
const getActiveProject = async (workspaceId, projectId) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  return project;
};

/**
 * Load an active task that belongs to the given project, or fail with a 404.
 */
const getActiveTask = async (projectId, taskId) => {
  const task = await Task.findOne({
    _id: taskId,
    project: projectId,
    isArchived: false,
  });

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  return task;
};

/**
 * Load a non-deleted comment that belongs to the given task, or fail with a 404.
 */
const getActiveComment = async (taskId, commentId) => {
  const comment = await TaskComment.findOne({
    _id: commentId,
    task: taskId,
    isDeleted: false,
  });

  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  return comment;
};

/**
 * Load an attachment scoped to its project.
 *
 * Scoping the lookup by `project` means an attachment owned by another project
 * is indistinguishable from a non-existent one (404). This single guard is what
 * prevents cross-project reads and deletes (requirement: users must not reach
 * files from projects they cannot access).
 */
const getProjectAttachment = async (projectId, attachmentId) => {
  const attachment = await Attachment.findOne({
    _id: attachmentId,
    project: projectId,
  });

  if (!attachment) {
    throw new ApiError(404, 'Attachment not found');
  }

  return attachment;
};

/**
 * Deletion follows the same rule as comment moderation: the uploader may
 * always delete their own file, and project OWNER/ADMIN (or a workspace
 * owner/admin) may delete anyone's. Plain members and viewers cannot.
 */
const assertCanDeleteAttachment = (attachment, project, userId, isWorkspaceElevated) => {
  const isUploader = attachment.uploader.toString() === userId.toString();

  if (isUploader) return;

  const projectMember = project.members.find(
    (member) => member.user.toString() === userId.toString()
  );

  const canModerate =
    isWorkspaceElevated ||
    (projectMember
      ? hasProjectPermission(projectMember.role, PROJECT_PERMISSIONS.MODERATE_ATTACHMENT)
      : false);

  if (!canModerate) {
    throw new ApiError(403, 'You can only delete your own attachments');
  }
};

/* ================================================================== *
 * Upload
 * ================================================================== */

/**
 * Re-validate an uploaded file immediately before it is persisted.
 *
 * Multer already filtered it, but this second pass makes the service safe to
 * call from anywhere (a future CLI import, a different transport) and means the
 * storage layer is never handed something the policy forbids.
 */
const assertFileIsAllowed = (file) => {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new ApiError(400, 'Please upload a file');
  }

  const mimeType = (file.mimetype || '').toLowerCase();
  const extension = getSafeExtension(file.originalname);

  if (!isAllowedMimeType(mimeType)) {
    throw new ApiError(400, 'Unsupported file type');
  }

  if (!extension || isBlockedExtension(extension)) {
    throw new ApiError(400, 'This file type is not allowed for security reasons');
  }

  if (!isExtensionAllowedForMimeType(mimeType, extension)) {
    throw new ApiError(400, 'File extension does not match its declared file type');
  }

  return { mimeType, extension };
};

/**
 * Resolve which entity the file belongs to and confirm the whole parent chain
 * is reachable. Returns the scope plus the ids to persist.
 */
const resolveAttachmentScope = async (projectId, { taskId, commentId }) => {
  if (commentId) {
    if (!taskId) {
      throw new ApiError(400, 'A task is required to attach a file to a comment');
    }

    const task = await getActiveTask(projectId, taskId);
    const comment = await getActiveComment(taskId, commentId);

    return {
      scope: ATTACHMENT_SCOPES.COMMENT,
      task,
      comment,
    };
  }

  if (taskId) {
    const task = await getActiveTask(projectId, taskId);

    return {
      scope: ATTACHMENT_SCOPES.TASK,
      task,
      comment: null,
    };
  }

  return {
    scope: ATTACHMENT_SCOPES.PROJECT,
    task: null,
    comment: null,
  };
};

export const uploadAttachment = async ({
  workspaceId,
  projectId,
  taskId = null,
  commentId = null,
  userId,
  file,
}) => {
  await getActiveProject(workspaceId, projectId);

  const { mimeType, extension } = assertFileIsAllowed(file);

  const { scope, task, comment } = await resolveAttachmentScope(projectId, {
    taskId,
    commentId,
  });

  const originalFilename = sanitizeOriginalFilename(file.originalname);

  /*
   * Persist the binary first. If the database write then fails, the stored
   * object is removed so a failed upload cannot leave an orphaned file behind.
   */
  const stored = await storageProvider.save({
    buffer: file.buffer,
    extension,
    scope: projectId,
  });

  let attachment;

  try {
    attachment = await Attachment.create({
      originalFilename,
      storedFilename: stored.storedFilename,
      mimeType,
      size: stored.size,
      uploader: userId,
      project: projectId,
      task: task ? task._id : null,
      comment: comment ? comment._id : null,
      scope,
      storage: {
        provider: storageProvider.name,
        key: stored.key,
        bucket: null,
      },
    });
  } catch (error) {
    await storageProvider.remove(stored.key).catch(() => {});

    throw error;
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'attachment_uploaded',
    metadata: {
      attachmentId: attachment._id,
      filename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      scope,
      ...(task && { taskId: task._id }),
      ...(comment && { commentId: comment._id }),
    },
  });

  await attachment.populate('uploader', UPLOADER_FIELDS);

  return attachment;
};

/* ================================================================== *
 * Listing
 * ================================================================== */

const listAttachments = async (filter, query = {}) => {
  const sort = buildSort(query, ATTACHMENT_SORT_FIELDS, ATTACHMENT_DEFAULT_SORT);

  const { items, pagination } = await findPaginated(Attachment, {
    filter,
    sort,
    query,
    populate: { path: 'uploader', select: UPLOADER_FIELDS },
  });

  return {
    attachments: items,
    pagination,
  };
};

/**
 * Every attachment in the project, newest first, optionally narrowed to one
 * scope (`project` | `task` | `comment`).
 */
export const getProjectAttachments = async (workspaceId, projectId, query = {}) => {
  await getActiveProject(workspaceId, projectId);

  const filter = { project: projectId };

  if (query.scope) {
    filter.scope = query.scope;
  }

  return listAttachments(filter, query);
};

/**
 * Attachments belonging to a task. Comment attachments also carry the task id,
 * so this includes files uploaded against the task's comments.
 */
export const getTaskAttachments = async (workspaceId, projectId, taskId, query = {}) => {
  await getActiveProject(workspaceId, projectId);

  const task = await getActiveTask(projectId, taskId);

  return listAttachments({ project: projectId, task: task._id }, query);
};

export const getCommentAttachments = async (
  workspaceId,
  projectId,
  taskId,
  commentId,
  query = {}
) => {
  await getActiveProject(workspaceId, projectId);

  const task = await getActiveTask(projectId, taskId);

  const comment = await getActiveComment(taskId, commentId);

  return listAttachments({ project: projectId, task: task._id, comment: comment._id }, query);
};

/* ================================================================== *
 * Download
 * ================================================================== */

/**
 * Resolve an attachment for download.
 *
 * Returns the record plus a readable stream. The parent chain is re-checked so
 * a record left behind by a removed task/comment cannot be used to reach a file
 * through a dangling reference.
 */
export const getAttachmentForDownload = async (workspaceId, projectId, attachmentId) => {
  await getActiveProject(workspaceId, projectId);

  const attachment = await getProjectAttachment(projectId, attachmentId);

  if (attachment.task) {
    const taskExists = await Task.exists({ _id: attachment.task, project: projectId });

    if (!taskExists) {
      throw new ApiError(404, 'Attachment is no longer available');
    }
  }

  if (attachment.comment) {
    const commentExists = await TaskComment.exists({
      _id: attachment.comment,
      isDeleted: false,
    });

    if (!commentExists) {
      throw new ApiError(404, 'Attachment is no longer available');
    }
  }

  const fileExists = await storageProvider.exists(attachment.storage.key);

  if (!fileExists) {
    throw new ApiError(404, 'Attachment file is missing from storage');
  }

  const stream = storageProvider.createReadStream(attachment.storage.key);

  return { attachment, stream };
};

/* ================================================================== *
 * Delete
 * ================================================================== */

/**
 * Remove an attachment record and its stored object.
 *
 * The database record is removed first because it is the source of truth: a
 * client must never be able to see a record whose file has already gone. The
 * stored object is then deleted best-effort — a storage hiccup leaves an
 * invisible orphan rather than a broken record.
 */
export const deleteAttachment = async (
  workspaceId,
  projectId,
  attachmentId,
  userId,
  isWorkspaceElevated = false
) => {
  const project = await getActiveProject(workspaceId, projectId);

  const attachment = await getProjectAttachment(projectId, attachmentId);

  assertCanDeleteAttachment(attachment, project, userId, isWorkspaceElevated);

  const { key } = attachment.storage;
  const snapshot = {
    attachmentId: attachment._id,
    filename: attachment.originalFilename,
    scope: attachment.scope,
    taskId: attachment.task,
    commentId: attachment.comment,
  };

  await attachment.deleteOne();

  await storageProvider.remove(key).catch(() => {});

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'attachment_deleted',
    metadata: snapshot,
  });

  return true;
};

/* ================================================================== *
 * Cascade cleanup
 *
 * Tasks and projects in this codebase are archived rather than hard-deleted,
 * so nothing calls the task/project helpers yet — they exist so that a future
 * hard-delete (or a retention job) cannot leave attachment rows pointing at a
 * parent that no longer exists.
 * ================================================================== */

/**
 * Delete every attachment row matching a filter, together with its stored file.
 * Returns the number of rows removed.
 */
const purgeAttachments = async (filter) => {
  const attachments = await Attachment.find(filter).select('storage.key');

  if (attachments.length === 0) {
    return 0;
  }

  const keys = attachments.map((attachment) => attachment.storage.key);

  const { deletedCount } = await Attachment.deleteMany(filter);

  // Best-effort: a failed unlink must not resurrect the already-removed rows.
  await Promise.all(keys.map((key) => storageProvider.remove(key).catch(() => {})));

  return deletedCount;
};

/**
 * Remove all attachments that belong to a comment.
 * Called when a comment is deleted so its files do not outlive it.
 */
export const purgeAttachmentsForComment = async (projectId, commentId) =>
  purgeAttachments({ project: projectId, comment: commentId });

/**
 * Remove all attachments that belong to a task (including its comments' files).
 */
export const purgeAttachmentsForTask = async (projectId, taskId) =>
  purgeAttachments({ project: projectId, task: taskId });

/**
 * Remove every attachment in a project.
 */
export const purgeAttachmentsForProject = async (projectId) =>
  purgeAttachments({ project: projectId });
