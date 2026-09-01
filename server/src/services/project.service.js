import Project from '../models/Project.js';

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