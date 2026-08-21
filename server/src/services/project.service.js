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
