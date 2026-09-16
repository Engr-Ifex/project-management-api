import mongoose from 'mongoose';
import ProjectActivity from '../models/ProjectActivity.js';
import ApiError from '../utils/ApiError.js';

import { buildSort, findPaginated, mergeFilters } from '../utils/query.js';
import { ACTIVITY_DEFAULT_SORT, ACTIVITY_SORT_FIELDS } from '../constants/query.js';

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
  const filter = mergeFilters(
    {
      workspace: workspaceId,
      project: projectId,
    },
    query.action ? { action: query.action } : null
  );

  const sort = buildSort(query, ACTIVITY_SORT_FIELDS, ACTIVITY_DEFAULT_SORT);

  const { items, pagination } = await findPaginated(ProjectActivity, {
    filter,
    sort,
    query,
    populate: { path: 'user', select: ACTOR_FIELDS },
  });

  return {
    activities: items,
    pagination,
  };
};

/**
 * Paginated audit trail for a single task, newest first.
 */
export const getTaskActivities = async (workspaceId, projectId, taskId, query = {}) => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new ApiError(400, 'Invalid task ID');
  }

  const filter = mergeFilters(
    {
      workspace: workspaceId,
      project: projectId,
      'metadata.taskId': new mongoose.Types.ObjectId(taskId),
    },
    query.action ? { action: query.action } : null
  );

  const sort = buildSort(query, ACTIVITY_SORT_FIELDS, ACTIVITY_DEFAULT_SORT);

  const { items, pagination } = await findPaginated(ProjectActivity, {
    filter,
    sort,
    query,
    populate: { path: 'user', select: ACTOR_FIELDS },
  });

  return {
    activities: items,
    pagination,
  };
};
