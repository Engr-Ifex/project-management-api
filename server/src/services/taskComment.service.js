import TaskComment from '../models/TaskComment.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import ApiError from '../utils/ApiError.js';
import { createProjectActivity } from './projectActivity.service.js';

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
 * Enforce object-level ownership: only the comment author may modify it.
 *
 * Elevated project roles are still gated by `requireProjectPermission`
 * at the route level, but the architecture does not define an explicit
 * "moderate other users' comments" capability, so ownership is required.
 */
const assertCommentOwner = (comment, userId) => {
  if (comment.author.toString() !== userId.toString()) {
    throw new ApiError(403, 'You can only modify your own comments');
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

export const deleteTaskComment = async (workspaceId, projectId, taskId, commentId, userId) => {
  const { task } = await getActiveProjectAndTask(workspaceId, projectId, taskId);

  const comment = await getActiveComment(taskId, commentId);

  assertCommentOwner(comment, userId);

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
    },
  });

  return true;
};
