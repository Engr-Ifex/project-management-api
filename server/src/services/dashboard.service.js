import mongoose from 'mongoose';

import Task from '../models/Task.js';
import Project from '../models/Project.js';
import Workspace from '../models/Workspace.js';

import ApiError from '../utils/ApiError.js';

import {
  CLOSED_TASK_STATUSES,
  DEFAULT_UPCOMING_DUE_DAYS,
  MAX_UPCOMING_DUE_DAYS,
} from '../constants/dashboard.js';

/*
 * Dashboard statistics.
 *
 * Every figure is computed by MongoDB aggregation rather than by loading
 * documents into application memory, so the cost stays proportional to the
 * matched set instead of the collection size.
 *
 * Accuracy rules applied consistently across all pipelines:
 *
 *   - Archived tasks are excluded from every task figure. "Archived" is the
 *     only removal mechanism for tasks/projects in this schema (there is no
 *     soft-delete field on them), so archived === deleted for reporting.
 *   - Archived projects are counted only in `archived`; they are excluded from
 *     the status distribution, because an archived project keeps whatever
 *     status it had and would otherwise distort the picture.
 *   - Completed and cancelled tasks are never overdue or upcoming.
 *   - `$unwind` after the project `$lookup` drops tasks whose project no longer
 *     exists, so a dangling reference can never inflate a total.
 */

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/*
 * Bucket lists come from the schemas themselves, so adding an enum value to a
 * model cannot silently leave the dashboard reporting a stale set of buckets.
 */
const PROJECT_STATUSES = Project.schema.path('status').enumValues;

const TASK_STATUSES = Task.schema.path('status').enumValues;

const TASK_PRIORITIES = Task.schema.path('priority').enumValues;

/**
 * Aggregation pipelines do not cast values, so ids must be converted
 * explicitly. An invalid id is a bad request rather than a server error.
 */
const toObjectId = (value, label) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${label}`);
  }

  return new mongoose.Types.ObjectId(value);
};

/**
 * A zero-filled bucket map, so the response shape is stable whether a status
 * has ten tasks or none. A frontend can read `byStatus.todo` without a guard.
 */
const fillBuckets = (keys, rows) => {
  const buckets = keys.reduce((accumulator, key) => Object.assign(accumulator, { [key]: 0 }), {});

  for (const row of rows) {
    if (row?._id != null && Object.hasOwn(buckets, row._id)) {
      buckets[row._id] = row.count;
    }
  }

  return buckets;
};

const roundTo = (value, decimals = 1) => {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
};

/**
 * Completion rate over *actionable* tasks.
 *
 * Cancelled tasks are removed from the denominator: a cancelled task is not
 * outstanding work, so counting it would understate progress. `cancelled` is
 * returned alongside so a client can recompute using a different convention.
 */
const computeCompletionPercentage = (completed, total, cancelled) => {
  const denominator = total - cancelled;

  if (denominator <= 0) {
    return 0;
  }

  return roundTo((completed / denominator) * 100);
};

/**
 * Shared "is this task late?" expression: it has a due date, that date is in
 * the past, and the task is still open.
 */
const overdueCondition = (now) => ({
  $and: [
    { $ne: ['$dueDate', null] },
    { $lt: ['$dueDate', now] },
    { $not: [{ $in: ['$status', CLOSED_TASK_STATUSES] }] },
  ],
});

/**
 * Shared "is this task due soon?" expression. Bounded at both ends so it never
 * overlaps `overdue`.
 */
const upcomingCondition = (now, until) => ({
  $and: [
    { $ne: ['$dueDate', null] },
    { $gte: ['$dueDate', now] },
    { $lte: ['$dueDate', until] },
    { $not: [{ $in: ['$status', CLOSED_TASK_STATUSES] }] },
  ],
});

const countCondition = (expression) => ({ $sum: { $cond: [expression, 1, 0] } });

const resolveUpcomingDueDays = (value) => {
  const parsed = Number.parseInt(value, 10);

  if (Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_UPCOMING_DUE_DAYS) {
    return parsed;
  }

  return DEFAULT_UPCOMING_DUE_DAYS;
};

/* ================================================================== *
 * Workspace statistics
 * ================================================================== */

/**
 * Project totals plus a status distribution.
 *
 * One `$facet` pass answers both questions: how many projects exist per archive
 * state, and how the live ones are distributed across statuses.
 */
const getWorkspaceProjectStats = async (workspaceObjectId) => {
  const [result] = await Project.aggregate([
    { $match: { workspace: workspaceObjectId } },
    {
      $facet: {
        archiveCounts: [{ $group: { _id: '$isArchived', count: { $sum: 1 } } }],
        statusCounts: [
          { $match: { isArchived: false } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const archiveRows = result?.archiveCounts ?? [];

  const total = archiveRows.reduce((sum, row) => sum + row.count, 0);

  /*
   * A missing `isArchived` is treated as not archived, matching the schema
   * default, so legacy rows are never counted twice or dropped.
   */
  const archived = archiveRows.find((row) => row._id === true)?.count ?? 0;

  return {
    total,
    active: total - archived,
    archived,
    byStatus: fillBuckets(PROJECT_STATUSES, result?.statusCounts ?? []),
  };
};

/* ================================================================== *
 * Project task statistics
 * ================================================================== */

/**
 * Task figures for a single project.
 *
 * A single `$facet` keeps this to one round trip: two bucket groupings plus one
 * totals row, all over the same matched set of live tasks.
 */
const getProjectTaskStats = async (projectObjectId, now, upcomingDueDays) => {
  const upcomingUntil = new Date(now.getTime() + upcomingDueDays * DAY_IN_MS);

  const [result] = await Task.aggregate([
    { $match: { project: projectObjectId, isArchived: false } },
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: countCondition({ $eq: ['$status', 'completed'] }),
              cancelled: countCondition({ $eq: ['$status', 'cancelled'] }),
              unassigned: countCondition({ $eq: ['$assignee', null] }),
              overdue: countCondition(overdueCondition(now)),
              upcoming: countCondition(upcomingCondition(now, upcomingUntil)),
              estimatedTimeTotal: { $sum: '$estimatedTime' },
              estimatedTimeCompleted: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$estimatedTime', 0] },
              },
            },
          },
        ],
      },
    },
  ]);

  const totals = result?.totals?.[0] ?? {};

  const total = totals.total ?? 0;
  const completed = totals.completed ?? 0;
  const cancelled = totals.cancelled ?? 0;

  const estimatedTimeTotal = totals.estimatedTimeTotal ?? 0;
  const estimatedTimeCompleted = totals.estimatedTimeCompleted ?? 0;

  return {
    total,
    byStatus: fillBuckets(TASK_STATUSES, result?.byStatus ?? []),
    byPriority: fillBuckets(TASK_PRIORITIES, result?.byPriority ?? []),
    completed,
    cancelled,
    overdue: totals.overdue ?? 0,
    upcoming: totals.upcoming ?? 0,
    upcomingDueDays,
    unassigned: totals.unassigned ?? 0,
    completionPercentage: computeCompletionPercentage(completed, total, cancelled),
    /*
     * `estimatedTime` is stored as whole minutes (see the Task model), so these
     * totals are minutes too. The unit is stated in the payload itself rather
     * than left implicit, so a client never has to infer it.
     */
    estimatedTime: {
      unit: 'minutes',
      total: estimatedTimeTotal,
      completed: estimatedTimeCompleted,
      remaining: estimatedTimeTotal - estimatedTimeCompleted,
    },
  };
};

/* ================================================================== *
 * User-focused statistics
 * ================================================================== */

const EMPTY_MY_TASKS = Object.freeze({ assigned: 0, completed: 0, overdue: 0 });

/**
 * The current user's own task figures inside one project.
 */
const getProjectMyTaskStats = async (projectObjectId, userObjectId, now) => {
  const [row] = await Task.aggregate([
    {
      $match: {
        project: projectObjectId,
        assignee: userObjectId,
        isArchived: false,
      },
    },
    {
      $group: {
        _id: null,
        assigned: { $sum: 1 },
        completed: countCondition({ $eq: ['$status', 'completed'] }),
        overdue: countCondition(overdueCondition(now)),
      },
    },
  ]);

  if (!row) {
    return { ...EMPTY_MY_TASKS };
  }

  return { assigned: row.assigned, completed: row.completed, overdue: row.overdue };
};

/**
 * The current user's own task figures across a whole workspace.
 *
 * The project join is a `$lookup` rather than "load the workspace's project
 * ids, then query with `$in`": it keeps the whole calculation in the database
 * and lets the assignee index drive the scan.
 */
const getWorkspaceMyTaskStats = async (workspaceObjectId, userObjectId, now) => {
  const [row] = await Task.aggregate([
    { $match: { assignee: userObjectId, isArchived: false } },
    {
      $lookup: {
        from: Project.collection.name,
        localField: 'project',
        foreignField: '_id',
        as: 'dashboardProject',
      },
    },
    // Drops tasks whose project is missing, so orphans cannot be counted.
    { $unwind: '$dashboardProject' },
    {
      $match: {
        'dashboardProject.workspace': workspaceObjectId,
        'dashboardProject.isArchived': false,
      },
    },
    {
      $group: {
        _id: null,
        assigned: { $sum: 1 },
        completed: countCondition({ $eq: ['$status', 'completed'] }),
        overdue: countCondition(overdueCondition(now)),
      },
    },
  ]);

  if (!row) {
    return { ...EMPTY_MY_TASKS };
  }

  return { assigned: row.assigned, completed: row.completed, overdue: row.overdue };
};

/* ================================================================== *
 * Public API
 * ================================================================== */

export const getWorkspaceDashboard = async (workspaceId, userId) => {
  const workspaceObjectId = toObjectId(workspaceId, 'workspace ID');
  const userObjectId = toObjectId(userId, 'user ID');

  const workspace = await Workspace.findOne({
    _id: workspaceObjectId,
    isArchived: false,
  }).select('name');

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  const now = new Date();

  const [projects, myTasks] = await Promise.all([
    getWorkspaceProjectStats(workspaceObjectId),
    getWorkspaceMyTaskStats(workspaceObjectId, userObjectId, now),
  ]);

  return {
    workspace: {
      id: workspace._id,
      name: workspace.name,
    },
    projects,
    myTasks,
  };
};

export const getProjectDashboard = async (workspaceId, projectId, userId, query = {}) => {
  const workspaceObjectId = toObjectId(workspaceId, 'workspace ID');
  const projectObjectId = toObjectId(projectId, 'project ID');
  const userObjectId = toObjectId(userId, 'user ID');

  const project = await Project.findOne({
    _id: projectObjectId,
    workspace: workspaceObjectId,
    isArchived: false,
  }).select('name status');

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const upcomingDueDays = resolveUpcomingDueDays(query.upcomingDueDays);

  const now = new Date();

  const [tasks, myTasks] = await Promise.all([
    getProjectTaskStats(projectObjectId, now, upcomingDueDays),
    getProjectMyTaskStats(projectObjectId, userObjectId, now),
  ]);

  return {
    project: {
      id: project._id,
      name: project.name,
      status: project.status,
    },
    tasks,
    myTasks,
  };
};
