import Notification from '../models/Notification.js';
import Task from '../models/Task.js';
import ApiError from '../utils/ApiError.js';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';

import { buildSort, findPaginated } from '../utils/query.js';
import { NOTIFICATION_DEFAULT_SORT, NOTIFICATION_SORT_FIELDS } from '../constants/query.js';

const ACTOR_FIELDS = 'name email avatar';

/*
 * Metadata convention for notifications mirrors ProjectActivity:
 * entity ids are camelCase and only the ids actually involved are set.
 */

export const createNotification = async ({
  recipient,
  actor = null,
  type,
  title,
  message = '',
  workspace = null,
  project = null,
  task = null,
  comment = null,
}) => {
  const notification = await Notification.create({
    recipient,
    actor,
    type,
    title,
    message,
    workspace,
    project,
    task,
    comment,
  });

  return notification;
};

/**
 * Never notify users about their own actions.
 */
const isSelfNotification = (actorId, recipientId) =>
  Boolean(actorId && recipientId && actorId.toString() === recipientId.toString());

/* ------------------------------------------------------------------ *
 * Typed event emitters
 * ------------------------------------------------------------------ */

export const notifyTaskAssigned = async ({
  workspaceId,
  projectId,
  task,
  actorId,
  recipientId,
  isReassignment = false,
}) => {
  if (!recipientId || isSelfNotification(actorId, recipientId)) return null;

  return createNotification({
    recipient: recipientId,
    actor: actorId,
    type: isReassignment ? NOTIFICATION_TYPES.TASK_REASSIGNED : NOTIFICATION_TYPES.TASK_ASSIGNED,
    title: isReassignment ? 'Task reassigned to you' : 'Task assigned to you',
    message: `You have been ${isReassignment ? 'reassigned' : 'assigned'} the task "${task.title}"`,
    workspace: workspaceId,
    project: projectId,
    task: task._id,
  });
};

export const notifyTaskDueSoon = async ({ workspaceId, projectId, task, recipientId, dueDate }) => {
  if (!recipientId) return null;

  return createNotification({
    recipient: recipientId,
    actor: null,
    type: NOTIFICATION_TYPES.TASK_DUE_SOON,
    title: 'Task due soon',
    message: `The task "${task.title}" is due on ${new Date(dueDate).toISOString()}`,
    workspace: workspaceId,
    project: projectId,
    task: task._id,
  });
};

export const notifyTaskComment = async ({
  workspaceId,
  projectId,
  task,
  commentId,
  actorId,
  recipientId,
  actorName,
}) => {
  if (!recipientId || isSelfNotification(actorId, recipientId)) return null;

  return createNotification({
    recipient: recipientId,
    actor: actorId,
    type: NOTIFICATION_TYPES.TASK_COMMENT_ADDED,
    title: 'New comment on a task',
    message: `${actorName || 'A project member'} commented on the task "${task.title}"`,
    workspace: workspaceId,
    project: projectId,
    task: task._id,
    comment: commentId,
  });
};

export const notifyProjectMemberAdded = async ({
  workspaceId,
  projectId,
  project,
  actorId,
  recipientId,
}) => {
  if (!recipientId || isSelfNotification(actorId, recipientId)) return null;

  return createNotification({
    recipient: recipientId,
    actor: actorId,
    type: NOTIFICATION_TYPES.PROJECT_MEMBER_ADDED,
    title: 'Added to a project',
    message: `You were added to the project "${project.name}"`,
    workspace: workspaceId,
    project: projectId,
  });
};

export const notifyProjectRoleChanged = async ({
  workspaceId,
  projectId,
  project,
  actorId,
  recipientId,
  role,
}) => {
  if (!recipientId || isSelfNotification(actorId, recipientId)) return null;

  return createNotification({
    recipient: recipientId,
    actor: actorId,
    type: NOTIFICATION_TYPES.PROJECT_ROLE_CHANGED,
    title: 'Your project role changed',
    message: `Your role in the project "${project.name}" is now ${role}`,
    workspace: workspaceId,
    project: projectId,
  });
};

export const notifyWorkspaceInvitation = async ({
  workspaceId,
  actorId,
  recipientId,
  workspaceName,
  role,
}) => {
  if (!recipientId || isSelfNotification(actorId, recipientId)) return null;

  return createNotification({
    recipient: recipientId,
    actor: actorId,
    type: NOTIFICATION_TYPES.WORKSPACE_INVITATION,
    title: 'Workspace invitation',
    message: `You have been invited to join the workspace "${workspaceName}" as ${role}`,
    workspace: workspaceId,
  });
};

/* ------------------------------------------------------------------ *
 * Recurring notifications
 * ------------------------------------------------------------------ */

/**
 * Create "task due soon" notifications for a project's assigned, unfinished
 * tasks whose due date falls inside the window.
 *
 * There is no scheduler in this codebase, so this is intended to be invoked
 * by an external scheduler (cron / worker) rather than on a request path.
 * Already-unread due-soon notifications for the same task are skipped so a
 * repeated run does not spam the assignee.
 */
export const createTaskDueSoonNotifications = async (
  workspaceId,
  projectId,
  { withinHours = 48 } = {}
) => {
  const now = new Date();
  const threshold = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

  const tasks = await Task.find({
    project: projectId,
    isArchived: false,
    assignee: { $ne: null },
    dueDate: { $ne: null, $gte: now, $lte: threshold },
    status: { $nin: ['completed', 'cancelled'] },
  });

  let created = 0;
  let skipped = 0;

  for (const task of tasks) {
    const existing = await Notification.findOne({
      recipient: task.assignee,
      type: NOTIFICATION_TYPES.TASK_DUE_SOON,
      task: task._id,
      isRead: false,
    });

    if (existing) {
      skipped++;
      continue;
    }

    await notifyTaskDueSoon({
      workspaceId,
      projectId,
      task,
      recipientId: task.assignee,
      dueDate: task.dueDate,
    });

    created++;
  }

  return { scanned: tasks.length, created, skipped };
};

/* ------------------------------------------------------------------ *
 * Retrieval (always scoped to the authenticated recipient)
 * ------------------------------------------------------------------ */

export const getUserNotifications = async (userId, query = {}) => {
  const filter = { recipient: userId };

  if (query.unread === true) {
    filter.isRead = false;
  }

  if (query.type) {
    filter.type = query.type;
  }

  const sort = buildSort(query, NOTIFICATION_SORT_FIELDS, NOTIFICATION_DEFAULT_SORT);

  const { items, pagination } = await findPaginated(Notification, {
    filter,
    sort,
    query,
    populate: { path: 'actor', select: ACTOR_FIELDS },
  });

  return {
    notifications: items,
    pagination,
  };
};

export const getUnreadNotifications = async (userId, query = {}) =>
  getUserNotifications(userId, { ...query, unread: true });

export const getUnreadNotificationCount = async (userId) =>
  Notification.countDocuments({ recipient: userId, isRead: false });

export const markNotificationAsRead = async (userId, notificationId) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId,
  });

  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();

    await notification.save();
  }

  return notification;
};

export const markAllNotificationsAsRead = async (userId) => {
  const result = await Notification.updateMany(
    {
      recipient: userId,
      isRead: false,
    },
    {
      $set: { isRead: true, readAt: new Date() },
    }
  );

  return { modified: result.modifiedCount };
};

export const deleteNotification = async (userId, notificationId) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId,
  });

  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  await notification.deleteOne();

  return true;
};
