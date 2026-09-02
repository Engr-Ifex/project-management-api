import Project from '../models/Project.js';
import ApiError from '../utils/ApiError.js';

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

export const updateProject = async (workspaceId, projectId, updateData) => {
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

  return project;
};

export const restoreProject = async (workspaceId, projectId) => {
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

  return project;
};
