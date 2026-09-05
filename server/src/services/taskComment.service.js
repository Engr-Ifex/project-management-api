import TaskComment from '../models/TaskComment.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import ApiError from '../utils/ApiError.js';
import { createProjectActivity } from './projectActivity.service.js';


export const createTaskComment = async (
  workspaceId,
  projectId,
  taskId,
  userId,
  content
) => {
  // 1. Check project
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  // 2. Check task
  const task = await Task.findOne({
    _id: taskId,
    project: projectId,
    isArchived: false,
  });

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  // 3. Check project membership
  const isProjectMember = project.members.some(
    (member) =>
      member.user.toString() === userId.toString()
  );

  if (!isProjectMember) {
    throw new ApiError(
      403,
      'You must be a project member to comment on this task'
    );
  }

  // 4. Create comment
  const comment = await TaskComment.create({
    task: taskId,
    user: userId,
    content,
  });

  // 5. Log activity
  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_updated',
    metadata: {
      taskId: task._id,
      action: 'comment_added',
      commentId: comment._id,
    },
  });

  // 6. Populate user
  await comment.populate({
    path: 'user',
    select: 'name email avatar',
  });

  return comment;
};

export const getTaskComments = async (
  workspaceId,
  projectId,
  taskId
) => {
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

  const comments = await TaskComment.find({
    task: taskId,
  })
    .populate('user', 'name email avatar')
    .sort({ createdAt: 1 });

  return comments;
};

export const updateTaskComment = async (
  workspaceId,
  projectId,
  taskId,
  commentId,
  userId,
  content
) => {
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

  const comment = await TaskComment.findOne({
    _id: commentId,
    task: taskId,
  });

  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  if (comment.user.toString() !== userId.toString()) {
    throw new ApiError(
      403,
      'You can only edit your own comments'
    );
  }

  comment.content = content;

  await comment.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_updated',
    metadata: {
      taskId: task._id,
      action: 'comment_updated',
      commentId: comment._id,
    },
  });

  await comment.populate({
    path: 'user',
    select: 'name email avatar',
  });

  return comment;
};

export const deleteTaskComment = async (
  workspaceId,
  projectId,
  taskId,
  commentId,
  userId
) => {
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

  const comment = await TaskComment.findOne({
    _id: commentId,
    task: taskId,
  });

  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  if (comment.user.toString() !== userId.toString()) {
    throw new ApiError(
      403,
      'You can only delete your own comments'
    );
  }

  await comment.deleteOne();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_updated',
    metadata: {
      taskId: task._id,
      action: 'comment_deleted',
      commentId,
    },
  });

  return true;
};