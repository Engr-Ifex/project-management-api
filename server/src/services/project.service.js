import Project from '../models/Project.js';
import Workspace from '../models/Workspace.js';
import ApiError from '../utils/ApiError.js';
import { createProjectActivity } from './projectActivity.service.js';

export const createProject = async (workspaceId, userId, projectData) => {
  const project = await Project.create({
    workspace: workspaceId,
    createdBy: userId,
    ...projectData,
    members: [
      {
        user: userId,
      },
    ],
  });

  await createProjectActivity({
    workspaceId,
    projectId: project._id,
    userId,
    action: 'created',
  });

  return project;
};

export const getWorkspaceProjects = async (workspaceId) => {
  const projects = await Project.find({
    workspace: workspaceId,
    isArchived: false,
  })
    .populate('createdBy', 'name email')
    .populate('members.user', 'name email avatar')
    .sort({ createdAt: -1 });

  return projects;
};

export const getProjectById = async (workspaceId, projectId) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
  })
    .populate('createdBy', 'name email avatar')
    .populate('members.user', 'name email avatar');

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  return project;
};

export const updateProject = async (workspaceId, projectId, updateData, userId) => {
  const changedFields = Object.keys(updateData);

  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      workspace: workspaceId,
      isArchived: false,
    },
    updateData,
    {
      new: true,
      runValidators: true,
    }
  )
    .populate('createdBy', 'name email avatar')
    .populate('members.user', 'name email avatar');

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'updated',
    metadata: {
      fields: changedFields,
    },
  });

  return project;
};

export const archiveProject = async (workspaceId, projectId, userId) => {
  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      workspace: workspaceId,
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
    .populate('members.user', 'name email avatar')
    .populate('archivedBy', 'name email avatar');

  if (!project) {
    throw new ApiError(404, 'Project not found or already archived');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'archived',
  });

  return project;
};

export const restoreProject = async (workspaceId, projectId, userId) => {
  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      workspace: workspaceId,
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
    .populate('members.user', 'name email avatar');

  if (!project) {
    throw new ApiError(404, 'Archived project not found');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'restored',
  });

  return project;
};

export const updateProjectStatus = async (workspaceId, projectId, status, userId) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const oldStatus = project.status;

  project.status = status;

  await project.save();

  await project.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'members.user',
      select: 'name email avatar',
    },
  ]);

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'status_changed',
    metadata: {
      from: oldStatus,
      to: status,
    },
  });

  return project;
};

export const addProjectMember = async (workspaceId, projectId, userId, performedBy) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const alreadyMember = project.members.some(
    (member) => member.user.toString() === userId.toString()
  );

  if (alreadyMember) {
    throw new ApiError(409, 'User is already a project member');
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    'members.user': userId,
  });

  if (!workspace) {
    throw new ApiError(400, 'User must be a workspace member before joining the project');
  }

  project.members.push({
    user: userId,
  });

  await project.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId: performedBy,
    action: 'member_added',
    metadata: {
      memberId: userId,
    },
  });

  await project.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'members.user',
      select: 'name email avatar',
    },
  ]);

  return project;
};

export const removeProjectMember = async (workspaceId, projectId, userId, performedBy) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const memberExists = project.members.some(
    (member) => member.user.toString() === userId.toString()
  );

  if (!memberExists) {
    throw new ApiError(404, 'User is not a project member');
  }

  if (project.createdBy.toString() === userId.toString()) {
    throw new ApiError(400, 'Project creator cannot be removed from the project');
  }

  project.members = project.members.filter(
    (member) => member.user.toString() !== userId.toString()
  );

  await project.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId: performedBy,
    action: 'member_removed',
    metadata: {
      memberId: userId,
    },
  });

  await project.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'members.user',
      select: 'name email avatar',
    },
  ]);

  return project;
};
