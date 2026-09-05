import Task from '../models/Task.js';
import Project from '../models/Project.js';
import ApiError from '../utils/ApiError.js';
import { createProjectActivity } from './projectActivity.service.js';

export const createTask = async (workspaceId, projectId, userId, taskData) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const isProjectMember = project.members.some(
    (member) => member.user.toString() === userId.toString()
  );

  if (!isProjectMember) {
    throw new ApiError(403, 'You must be a project member to create a task');
  }

  if (taskData.assignee) {
    const isAssigneeProjectMember = project.members.some(
      (member) => member.user.toString() === taskData.assignee.toString()
    );

    if (!isAssigneeProjectMember) {
      throw new ApiError(400, 'Assignee must be a project member');
    }
  }

  const lastTask = await Task.findOne({
    project: projectId,
    isArchived: false,
  }).sort({ position: -1 });

  const position = lastTask ? lastTask.position + 1 : 0;

  const task = await Task.create({
    project: projectId,
    createdBy: userId,
    ...taskData,
    position,
  });

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_created',
    metadata: {
      taskId: task._id,
      taskTitle: task.title,
    },
  });

  await task.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'assignee',
      select: 'name email avatar',
    },
  ]);

  return task;
};


export const getProjectTasks = async (
  workspaceId,
  projectId
) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(
      404,
      'Project not found'
    );
  }

  const tasks = await Task.find({
    project: projectId,
    isArchived: false,
  })
    .populate('createdBy', 'name email avatar')
    .populate('assignee', 'name email avatar')
    .sort({ position: 1, createdAt: 1 });

  return tasks;
};

export const getTaskById = async (
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
    throw new ApiError(
      404,
      'Project not found'
    );
  }

  const task = await Task.findOne({
    _id: taskId,
    project: projectId,
    isArchived: false,
  })
    .populate('createdBy', 'name email avatar')
    .populate('assignee', 'name email avatar');

  if (!task) {
    throw new ApiError(
      404,
      'Task not found'
    );
  }

  return task;
};

export const updateTask = async (
  workspaceId,
  projectId,
  taskId,
  updateData,
  userId
) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(
      404,
      'Project not found'
    );
  }

  const task = await Task.findOne({
    _id: taskId,
    project: projectId,
    isArchived: false,
  });

  if (!task) {
    throw new ApiError(
      404,
      'Task not found'
    );
  }

  const changedFields = Object.keys(updateData);

  Object.assign(task, updateData);

  await task.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_updated',
    metadata: {
      taskId: task._id,
      fields: changedFields,
    },
  });

  await task.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'assignee',
      select: 'name email avatar',
    },
  ]);

  return task;
};

export const archiveTask = async (
  workspaceId,
  projectId,
  taskId,
  userId
) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(
      404,
      'Project not found'
    );
  }

  const task = await Task.findOneAndUpdate(
    {
      _id: taskId,
      project: projectId,
      isArchived: false,
    },
    {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: userId,
    },
    {
      new: true,
      runValidators: true,
    }
  )
    .populate('createdBy', 'name email avatar')
    .populate('assignee', 'name email avatar')
    .populate('archivedBy', 'name email avatar');

  if (!task) {
    throw new ApiError(
      404,
      'Task not found or already archived'
    );
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_archived',
    metadata: {
      taskId: task._id,
      taskTitle: task.title,
    },
  });

  return task;
};

export const restoreTask = async (
  workspaceId,
  projectId,
  taskId,
  userId
) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(
      404,
      'Project not found'
    );
  }

  const task = await Task.findOneAndUpdate(
    {
      _id: taskId,
      project: projectId,
      isArchived: true,
    },
    {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
    },
    {
      new: true,
      runValidators: true,
    }
  )
    .populate('createdBy', 'name email avatar')
    .populate('assignee', 'name email avatar');

  if (!task) {
    throw new ApiError(
      404,
      'Archived task not found'
    );
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_restored',
    metadata: {
      taskId: task._id,
      taskTitle: task.title,
    },
  });

  return task;
};

export const updateTaskStatus = async (
  workspaceId,
  projectId,
  taskId,
  status,
  userId
) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(
      404,
      'Project not found'
    );
  }

  const task = await Task.findOne({
    _id: taskId,
    project: projectId,
    isArchived: false,
  });

  if (!task) {
    throw new ApiError(
      404,
      'Task not found'
    );
  }

  const oldStatus = task.status;

  if (oldStatus === status) {
    throw new ApiError(
      400,
      `Task is already ${status}`
    );
  }

  task.status = status;

  await task.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'task_status_changed',
    metadata: {
      taskId: task._id,
      from: oldStatus,
      to: status,
    },
  });

  await task.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'assignee',
      select: 'name email avatar',
    },
  ]);

  return task;
};