import mongoose from 'mongoose';
import ProjectActivity from '../models/ProjectActivity.js';
import ApiError from '../utils/ApiError.js';
import { buildPagination, paginationMeta } from '../utils/pagination.js';

const ACTOR_FIELDS = 'name email avatar';

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

/**
 * Paginated project audit trail, newest first.
 */
export const getProjectActivities = async (workspaceId, projectId, query = {}) => {
  const { page, limit, skip } = buildPagination(query);

  const filter = {
    workspace: workspaceId,
    project: projectId,
  };

  const [activities, total] = await Promise.all([
    ProjectActivity.find(filter)
      .populate('user', ACTOR_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProjectActivity.countDocuments(filter),
  ]);

  return {
    activities,
    pagination: paginationMeta({ page, limit, total }),
  };
};

/**
 * Paginated audit trail for a single task, newest first.
 */
export const getTaskActivities = async (workspaceId, projectId, taskId, query = {}) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new ApiError(400, 'Invalid task ID');
  }

  const { page, limit, skip } = buildPagination(query);

  const filter = {
    workspace: workspaceId,
    project: projectId,
    'metadata.taskId': new mongoose.Types.ObjectId(taskId),
  };

  const [activities, total] = await Promise.all([
    ProjectActivity.find(filter)
      .populate('user', ACTOR_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProjectActivity.countDocuments(filter),
  ]);

  return {
    activities,
    pagination: paginationMeta({ page, limit, total }),
  };
};
