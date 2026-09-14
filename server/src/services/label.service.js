import Label from '../models/Label.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import ApiError from '../utils/ApiError.js';
import { createProjectActivity } from './projectActivity.service.js';

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

export const getProjectLabels = async (workspaceId, projectId) => {
  await getActiveProject(workspaceId, projectId);

  const labels = await Label.find({
    project: projectId,
  }).sort({ createdAt: 1 });

  return labels;
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

  const task = await getActiveTask(projectId, taskId);

  // Project-scoped lookup blocks cross-project label assignment.
  const label = await getProjectLabel(projectId, labelId);

  const isAssigned = task.labels.some((taskLabel) => taskLabel.toString() === label._id.toString());

  if (isAssigned) {
    throw new ApiError(400, 'Label is already assigned to this task');
  }

  task.labels.push(label._id);

  await task.save();

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

  const task = await getActiveTask(projectId, taskId);

  const label = await getProjectLabel(projectId, labelId);

  const isAssigned = task.labels.some((taskLabel) => taskLabel.toString() === label._id.toString());

  if (!isAssigned) {
    throw new ApiError(400, 'Label is not assigned to this task');
  }

  task.labels.pull(label._id);

  await task.save();

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
