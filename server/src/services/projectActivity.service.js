import ProjectActivity from '../models/ProjectActivity.js';

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
