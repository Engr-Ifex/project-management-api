import TaskComment from '../models/TaskComment.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import ApiError from '../utils/ApiError.js';
import { createProjectActivity } from './projectActivity.service.js';

import PROJECT_PERMISSIONS from '../constants/projectPermission.js';
import { hasProjectPermission } from '../constants/projectRolePermissions.js';
import { notifyTaskComment } from './notification.service.js';
import { purgeAttachmentsForComment } from './attachment.service.js';

/*
 * Author fields that are safe to expose.
 * `password` is `select: false` on the User model and is never returned.
 */
const AUTHOR_FIELDS = 'name email avatar';

/**
 * Load an active project inside a workspace together with an active task
 * that belongs to it. Throws a 404 when either resource cannot be found.
 *
 * This guarantees a comment can never be attached to, or read from, a task
 * that does not belong to the project/workspace in the URL.
 */
const getActiveProjectAndTask = async (workspaceId, projectId, taskId) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const task = await Task.findOne({
    _id: taskId,
    project: projectId,
    isArchived: false,
  });

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  return { project, task };
};

/**
 * Load a single non-deleted comment that belongs to the given task.
 * Soft-deleted comments are treated as not found so their content is
 * never exposed.
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
 * Enforce object-level ownership: only the comment author may edit it.
 *
 * Editing another user's words is not a moderation action, so no role
 * (project or workspace) may override this.
 */
const assertCommentOwner = (comment, userId) => {
  if (comment.author.toString() !== userId.toString()) {
    throw new ApiError(403, 'You can only edit your own comments');
  }
};

/**
 * Deletion follows the same author-only rule as editing, with one explicit
 * exception: the authorization architecture grants `comment:moderate` to
 * project OWNER/ADMIN, and workspace owners/admins already hold elevated
 * authority over their projects. Those callers may delete another member's
 * comment. Plain project members and viewers cannot.
 */
const assertCanDeleteComment = (comment, project, userId, isWorkspaceElevated) => {
  const isAuthor = comment.author.toString() === userId.toString();

  if (isAuthor) return;

  const projectMember = project.members.find(
    (member) => member.user.toString() === userId.toString()
  );

  const canModerate =
    isWorkspaceElevated ||
    (projectMember
      ? hasProjectPermission(projectMember.role, PROJECT_PERMISSIONS.MODERATE_COMMENT)
      : false);

  if (!canModerate) {
    throw new ApiError(403, 'You can only delete your own comments');
  }
};

export const createTaskComment = async (workspaceId, projectId, taskId, userId, content) => {
  const { task } = await getActiveProjectAndTask(workspaceId, projectId, taskId);

  const comment = await TaskComment.create({
    task: taskId,
    project: projectId,
    author: userId,
    content,
  });

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_comment_added',
    metadata: {
      taskId: task._id,
      commentId: comment._id,
    },
  });

  await comment.populate('author', AUTHOR_FIELDS);

  /*
   * Notify the users already involved with the task (assignee and creator).
   * The commenter is never notified about their own comment.
   */
  const recipients = new Set();

  if (task.assignee) {
    recipients.add(task.assignee.toString());
  }

  if (task.createdBy) {
    recipients.add(task.createdBy.toString());
  }

  recipients.delete(userId.toString());

  for (const recipientId of recipients) {
    await notifyTaskComment({
      workspaceId,
      projectId,
      task,
      commentId: comment._id,
      actorId: userId,
      recipientId,
      actorName: comment.author?.name,
    });
  }

  return comment;
};

export const getTaskComments = async (workspaceId, projectId, taskId) => {
  await getActiveProjectAndTask(workspaceId, projectId, taskId);

  const comments = await TaskComment.find({
    task: taskId,
    isDeleted: false,
  })
    .populate('author', AUTHOR_FIELDS)
    .sort({ createdAt: 1 });

  return comments;
};

export const getTaskCommentById = async (workspaceId, projectId, taskId, commentId) => {
  await getActiveProjectAndTask(workspaceId, projectId, taskId);

  const comment = await TaskComment.findOne({
    _id: commentId,
    task: taskId,
    isDeleted: false,
  }).populate('author', AUTHOR_FIELDS);

  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  return comment;
};

export const updateTaskComment = async (
  workspaceId,
  projectId,
  taskId,
  commentId,
  userId,
  content
) => {
  const { task } = await getActiveProjectAndTask(workspaceId, projectId, taskId);

  const comment = await getActiveComment(taskId, commentId);

  assertCommentOwner(comment, userId);

  comment.content = content;
  comment.editedAt = new Date();

  await comment.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_comment_updated',
    metadata: {
      taskId: task._id,
      commentId: comment._id,
    },
  });

  await comment.populate('author', AUTHOR_FIELDS);

  return comment;
};

export const deleteTaskComment = async (
  workspaceId,
  projectId,
  taskId,
  commentId,
  userId,
  isWorkspaceElevated = false
) => {
  const { project, task } = await getActiveProjectAndTask(workspaceId, projectId, taskId);

  const comment = await getActiveComment(taskId, commentId);

  assertCanDeleteComment(comment, project, userId, isWorkspaceElevated);

  // Record whether the deletion was performed by the author or a moderator.
  const isModerated = comment.author.toString() !== userId.toString();

  comment.isDeleted = true;
  comment.deletedAt = new Date();
  comment.deletedBy = userId;

  await comment.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_comment_deleted',
    metadata: {
      taskId: task._id,
      commentId: comment._id,
      ...(isModerated && {
        authorId: comment.author,
        moderated: true,
      }),
    },
  });

  /*
   * A deleted comment must not leave its attachments behind. They would be
   * unreachable through the API (downloads re-check the parent comment) yet
   * still occupy storage, so they are purged here.
   */
  await purgeAttachmentsForComment(projectId, comment._id);

  return true;
};
