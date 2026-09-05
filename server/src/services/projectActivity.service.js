import mongoose from 'mongoose';
import ProjectActivity from '../models/ProjectActivity.js';
import ApiError from '../utils/ApiError.js';

export const createProjectActivity = async ({
  workspaceId,
  projectId,
  userId,
  action,
  metadata = {},
}) => {
  const activity = await ProjectActivity.create({
    workspace: workspaceId,
    project: projectId,
    user: userId,
    action,
    metadata,
  });

  return activity;
};

export const getProjectActivities = async (workspaceId, projectId) => {
  const activities = await ProjectActivity.find({
    workspace: workspaceId,
    project: projectId,
  })
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 });

  return activities;
};

export const getTaskActivities = async (
  workspaceId,
  projectId,
  taskId
) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new ApiError(400, 'Invalid task ID');
  }

  const activities = await ProjectActivity.find({
    workspace: workspaceId,
    project: projectId,
    'metadata.taskId': new mongoose.Types.ObjectId(taskId),
  })
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 });

  return activities;
};