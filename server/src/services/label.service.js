import Label from '../models/Label.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import ApiError from '../utils/ApiError.js';
import { createProjectActivity } from './projectActivity.service.js';

import { buildSearchFilter, buildSort, findPaginated, mergeFilters } from '../utils/query.js';

import { LABEL_DEFAULT_SORT, LABEL_SEARCH_FIELDS, LABEL_SORT_FIELDS } from '../constants/query.js';

/*
 * Fields safe to expose when a label is populated onto a task.
 */
const LABEL_FIELDS = 'name color';

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
 * Load a label that belongs to the given project.
 *
 * Scoping the lookup by `project` means a label owned by another project is
 * indistinguishable from a non-existent one (404). Labels therefore can never
 * be read, updated, deleted, or assigned across project boundaries.
 */
const getProjectLabel = async (projectId, labelId) => {
  const label = await Label.findOne({
    _id: labelId,
    project: projectId,
  });

  if (!label) {
    throw new ApiError(404, 'Label not found');
  }

  return label;
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

export const createLabel = async (workspaceId, projectId, userId, { name, color }) => {
  await getActiveProject(workspaceId, projectId);

  const existingLabel = await Label.findOne({
    project: projectId,
    name,
  });

  if (existingLabel) {
    throw new ApiError(409, 'A label with this name already exists in this project');
  }

  const label = await Label.create({
    project: projectId,
    name,
    color,
  });

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'label_created',
    metadata: {
      labelId: label._id,
      name: label.name,
    },
  });

  return label;
};

export const getProjectLabels = async (workspaceId, projectId, query = {}) => {
  await getActiveProject(workspaceId, projectId);

  const filter = mergeFilters(
    { project: projectId },
    buildSearchFilter(query.search, LABEL_SEARCH_FIELDS)
  );

  const sort = buildSort(query, LABEL_SORT_FIELDS, LABEL_DEFAULT_SORT, 'asc');

  const { items, pagination } = await findPaginated(Label, { filter, sort, query });

  return { labels: items, pagination };
};

export const getLabelById = async (workspaceId, projectId, labelId) => {
  await getActiveProject(workspaceId, projectId);

  const label = await getProjectLabel(projectId, labelId);

  return label;
};

export const updateLabel = async (workspaceId, projectId, labelId, userId, updateData) => {
  await getActiveProject(workspaceId, projectId);

  const label = await getProjectLabel(projectId, labelId);

  // Prevent renaming a label onto another label in the same project.
  if (updateData.name && updateData.name !== label.name) {
    const existingLabel = await Label.findOne({
      project: projectId,
      name: updateData.name,
      _id: { $ne: label._id },
    });

    if (existingLabel) {
      throw new ApiError(409, 'A label with this name already exists in this project');
    }
  }

  const changedFields = Object.keys(updateData);

  Object.assign(label, updateData);

  await label.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'label_updated',
    metadata: {
      labelId: label._id,
      fields: changedFields,
    },
  });

  return label;
};

export const deleteLabel = async (workspaceId, projectId, labelId, userId) => {
  await getActiveProject(workspaceId, projectId);

  const label = await getProjectLabel(projectId, labelId);

  /*
   * Detach the label from every task referencing it before deleting it,
   * so no task is left holding a dangling label reference.
   */
  await Task.updateMany(
    {
      project: projectId,
      labels: label._id,
    },
    {
      $pull: { labels: label._id },
    }
  );

  await label.deleteOne();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'label_deleted',
    metadata: {
      labelId: label._id,
      name: label.name,
    },
  });

  return true;
};

export const assignLabelToTask = async (workspaceId, projectId, taskId, labelId, userId) => {
  await getActiveProject(workspaceId, projectId);

  // Project-scoped lookup blocks cross-project label assignment.
  const label = await getProjectLabel(projectId, labelId);

  /*
   * Attach with an atomic conditional update.
   *
   * The `labels: { $nin: [...] }` guard is evaluated by the database as part of
   * the write and `$addToSet` cannot create a duplicate, so two concurrent
   * assigns cannot both report success and cannot leave the label attached
   * twice. The previous version read the task, tested the array in memory and
   * saved the whole array back — a lost update, where the slower request
   * silently discarded the faster one's change.
   */
  const task = await Task.findOneAndUpdate(
    {
      _id: taskId,
      project: projectId,
      isArchived: false,
      labels: { $nin: [label._id] },
    },
    { $addToSet: { labels: label._id } },
    { new: true }
  );

  if (!task) {
    // Distinguish "no such task" (404) from "already attached" (400).
    await getActiveTask(projectId, taskId);

    throw new ApiError(400, 'Label is already assigned to this task');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'label_assigned',
    metadata: {
      taskId: task._id,
      labelId: label._id,
      name: label.name,
    },
  });

  await task.populate('labels', LABEL_FIELDS);

  return task;
};

export const removeLabelFromTask = async (workspaceId, projectId, taskId, labelId, userId) => {
  await getActiveProject(workspaceId, projectId);

  const label = await getProjectLabel(projectId, labelId);

  /*
   * Detach with an atomic conditional update, for the same reason the attach
   * uses one: `labels: { $in: [...] }` makes "was attached" part of the write
   * rather than a separate read, so a concurrent attach and detach cannot
   * interleave into a lost update.
   */
  const task = await Task.findOneAndUpdate(
    {
      _id: taskId,
      project: projectId,
      isArchived: false,
      labels: { $in: [label._id] },
    },
    { $pull: { labels: label._id } },
    { new: true }
  );

  if (!task) {
    await getActiveTask(projectId, taskId);

    throw new ApiError(400, 'Label is not assigned to this task');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'label_removed',
    metadata: {
      taskId: task._id,
      labelId: label._id,
      name: label.name,
    },
  });

  await task.populate('labels', LABEL_FIELDS);

  return task;
};
