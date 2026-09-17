import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  addProjectMember,
  addWorkspaceMember,
  asUser,
  createProject,
  createTask,
  createUser,
  createWorkspace,
} from './helpers/factories.js';

let app;

before(async () => {
  app = await startTestDatabase();
});

after(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearDatabase();
});

const API = '/api/v1';

const DAY = 24 * 60 * 60 * 1000;
const days = (n) => new Date(Date.now() + n * DAY);

describe('Dashboard', () => {
  describe('workspace dashboard', () => {
    test('reports project totals and status distribution', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);

      await createProject(workspace, owner, { name: 'A', status: 'active' });
      await createProject(workspace, owner, { name: 'B', status: 'active' });
      await createProject(workspace, owner, { name: 'C', status: 'planning' });
      const archived = await createProject(workspace, owner, { name: 'D', status: 'completed' });
      archived.isArchived = true;
      await archived.save();

      const response = await asUser(app, owner).get(`${API}/workspaces/${workspace._id}/dashboard`);

      assert.equal(response.status, 200);

      const { projects } = response.body.data;

      assert.equal(projects.total, 4);
      assert.equal(projects.active, 3);
      assert.equal(projects.archived, 1);
      assert.equal(projects.byStatus.active, 2);
      assert.equal(projects.byStatus.planning, 1);
      assert.equal(projects.byStatus.completed, 0, 'archived projects are excluded from byStatus');
    });

    test('reports the caller\u2019s own task figures', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);

      await createTask(project, owner, { title: 'Mine 1', assignee: owner._id });
      await createTask(project, owner, {
        title: 'Mine 2',
        assignee: owner._id,
        status: 'completed',
      });
      await createTask(project, owner, {
        title: 'Overdue',
        assignee: owner._id,
        dueDate: days(-3),
      });
      await createTask(project, owner, { title: 'Unassigned' });

      const response = await asUser(app, owner).get(`${API}/workspaces/${workspace._id}/dashboard`);

      const { myTasks } = response.body.data;

      assert.equal(myTasks.assigned, 3);
      assert.equal(myTasks.completed, 1);
      assert.equal(myTasks.overdue, 1);
    });

    test('returns zeroes for an empty workspace', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);

      const response = await asUser(app, owner).get(`${API}/workspaces/${workspace._id}/dashboard`);

      assert.equal(response.body.data.projects.total, 0);
      assert.equal(response.body.data.myTasks.assigned, 0);
    });

    test('an outsider cannot read the dashboard', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const outsider = await createUser({ name: 'Outsider' });

      const response = await asUser(app, outsider).get(
        `${API}/workspaces/${workspace._id}/dashboard`
      );

      assert.equal(response.status, 403);
    });
  });

  describe('project dashboard', () => {
    test('computes task statistics accurately', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);

      await createTask(project, owner, {
        title: 'Todo overdue',
        status: 'todo',
        priority: 'high',
        dueDate: days(-5),
        assignee: owner._id,
        estimatedTime: 10,
      });
      await createTask(project, owner, {
        title: 'Upcoming',
        status: 'in_progress',
        priority: 'medium',
        dueDate: days(2),
        assignee: owner._id,
        estimatedTime: 20,
      });
      await createTask(project, owner, {
        title: 'Done',
        status: 'completed',
        priority: 'low',
        dueDate: days(-5),
        assignee: owner._id,
        estimatedTime: 30,
      });
      await createTask(project, owner, {
        title: 'Cancelled',
        status: 'cancelled',
        priority: 'urgent',
        assignee: owner._id,
        estimatedTime: 15,
      });
      // Priority is explicit so the priority matrix below is unambiguous.
      await createTask(project, owner, { title: 'Unassigned', status: 'todo', priority: 'high' });

      const response = await asUser(app, owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard`
      );

      assert.equal(response.status, 200);

      const { tasks } = response.body.data;

      assert.equal(tasks.total, 5);
      assert.equal(tasks.byStatus.todo, 2);
      assert.equal(tasks.byStatus.in_progress, 1);
      assert.equal(tasks.byStatus.completed, 1);
      assert.equal(tasks.byStatus.cancelled, 1);
      assert.equal(tasks.byPriority.high, 2);
      assert.equal(tasks.byPriority.medium, 1);
      assert.equal(tasks.byPriority.low, 1);
      assert.equal(tasks.byPriority.urgent, 1);

      assert.equal(tasks.completed, 1);
      assert.equal(tasks.cancelled, 1);
      assert.equal(tasks.overdue, 1, 'only the open task with a past due date is overdue');
      assert.equal(tasks.upcoming, 1);
      assert.equal(tasks.unassigned, 1);

      // completed / (total - cancelled) = 1 / 4 = 25%
      assert.equal(tasks.completionPercentage, 25);

      assert.equal(tasks.estimatedTime.total, 75);
      assert.equal(tasks.estimatedTime.completed, 30);
      assert.equal(tasks.estimatedTime.remaining, 45);
      assert.equal(tasks.estimatedTime.unit, 'minutes');
    });

    test('excludes archived tasks from every figure', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);

      await createTask(project, owner, { title: 'Live' });
      await createTask(project, owner, { title: 'Archived', isArchived: true, estimatedTime: 999 });

      const response = await asUser(app, owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard`
      );

      assert.equal(response.body.data.tasks.total, 1);
      assert.equal(response.body.data.tasks.estimatedTime.total, 0);
    });

    test('honours the upcomingDueDays window', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);

      await createTask(project, owner, { title: 'In 2 days', dueDate: days(2) });
      await createTask(project, owner, { title: 'In 10 days', dueDate: days(10) });

      const narrow = await asUser(app, owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard?upcomingDueDays=7`
      );
      const wide = await asUser(app, owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard?upcomingDueDays=14`
      );

      assert.equal(narrow.body.data.tasks.upcoming, 1);
      assert.equal(wide.body.data.tasks.upcoming, 2);
      assert.equal(wide.body.data.tasks.upcomingDueDays, 14);
    });

    test('rejects an out-of-range window', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);

      const response = await asUser(app, owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard?upcomingDueDays=9999`
      );

      assert.equal(response.status, 400);
    });

    test('handles a project with no tasks without dividing by zero', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);

      const response = await asUser(app, owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard`
      );

      assert.equal(response.body.data.tasks.total, 0);
      assert.equal(response.body.data.tasks.completionPercentage, 0);
      assert.equal(response.body.data.tasks.estimatedTime.remaining, 0);
    });

    test('a project member can read the project dashboard', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);
      const member = await createUser({ name: 'Member' });
      await addWorkspaceMember(workspace, member, 'member');
      await addProjectMember(project, member, 'viewer');

      const response = await asUser(app, member).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard`
      );

      assert.equal(response.status, 200);
    });

    test('an outsider cannot read the project dashboard', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);
      const outsider = await createUser({ name: 'Outsider' });

      const response = await asUser(app, outsider).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard`
      );

      assert.equal(response.status, 403);
    });
  });
});
