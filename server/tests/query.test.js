import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  asUser,
  createLabel,
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

const setup = async () => {
  const owner = await createUser({ name: 'Owner' });
  const workspace = await createWorkspace(owner);
  const project = await createProject(workspace, owner);

  return {
    owner,
    workspace,
    project,
    client: asUser(app, owner),
    tasksUrl: `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`,
    projectsUrl: `${API}/workspaces/${workspace._id}/projects`,
  };
};

const seedTasks = async (project, owner) => {
  const label = await createLabel(project, { name: 'Urgent' });

  await createTask(project, owner, {
    title: 'Alpha bug',
    description: 'login failure',
    status: 'todo',
    priority: 'high',
    assignee: owner._id,
    dueDate: days(1),
    position: 0,
    estimatedTime: 30,
  });
  await createTask(project, owner, {
    title: 'Beta docs',
    description: 'write readme',
    status: 'in_progress',
    priority: 'low',
    assignee: owner._id,
    dueDate: days(-2),
    position: 1,
    labels: [label._id],
  });
  await createTask(project, owner, {
    title: 'Gamma deploy',
    description: 'ship it',
    status: 'completed',
    priority: 'urgent',
    position: 2,
  });

  return { label };
};

describe('Search, filtering, pagination and sorting', () => {
  describe('pagination', () => {
    test('returns the shared pagination block', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(tasksUrl);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.pagination.page, 1);
      assert.equal(response.body.data.pagination.total, 3);
      assert.equal(response.body.data.pagination.totalPages, 1);
      assert.equal(response.body.data.pagination.hasNextPage, false);
      assert.equal(response.body.data.pagination.hasPrevPage, false);
    });

    test('splits results across pages without overlap', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const page1 = await client.get(`${tasksUrl}?limit=2&page=1`);
      const page2 = await client.get(`${tasksUrl}?limit=2&page=2`);

      assert.equal(page1.body.data.tasks.length, 2);
      assert.equal(page2.body.data.tasks.length, 1);
      assert.equal(page1.body.data.pagination.hasNextPage, true);
      assert.equal(page2.body.data.pagination.hasPrevPage, true);

      const ids = [...page1.body.data.tasks, ...page2.body.data.tasks].map((task) =>
        String(task._id)
      );
      assert.equal(new Set(ids).size, 3, 'pages must not repeat rows');
    });

    test('returns an empty page beyond the end', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?page=99`);

      assert.equal(response.body.data.tasks.length, 0);
      assert.equal(response.body.data.pagination.total, 3);
    });

    test('rejects an invalid page', async () => {
      const { client, tasksUrl } = await setup();

      assert.equal((await client.get(`${tasksUrl}?page=0`)).status, 400);
      assert.equal((await client.get(`${tasksUrl}?page=-1`)).status, 400);
      assert.equal((await client.get(`${tasksUrl}?page=abc`)).status, 400);
    });

    test('rejects a limit above the maximum', async () => {
      const { client, tasksUrl } = await setup();

      assert.equal((await client.get(`${tasksUrl}?limit=500`)).status, 400);
    });
  });

  describe('sorting', () => {
    test('sorts by title ascending and descending', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const asc = await client.get(`${tasksUrl}?sortBy=title&order=asc`);
      const desc = await client.get(`${tasksUrl}?sortBy=title&order=desc`);

      assert.equal(asc.body.data.tasks[0].title, 'Alpha bug');
      assert.equal(desc.body.data.tasks[0].title, 'Gamma deploy');
    });

    test('sorts by due date', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?sortBy=dueDate&order=asc`);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.tasks.length, 3);
    });

    test('defaults to position order', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(tasksUrl);
      const titles = response.body.data.tasks.map((task) => task.title);

      assert.deepEqual(titles, ['Alpha bug', 'Beta docs', 'Gamma deploy']);
    });

    test('rejects a non-whitelisted sort field', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.get(`${tasksUrl}?sortBy=password`);

      assert.equal(response.status, 400);
    });

    test('rejects an operator-shaped sort field', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.get(`${tasksUrl}?sortBy=$where`);

      assert.equal(response.status, 400);
    });

    test('rejects an invalid order', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.get(`${tasksUrl}?sortBy=title&order=sideways`);

      assert.equal(response.status, 400);
    });
  });

  describe('task filtering', () => {
    test('filters by status', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?status=completed`);

      assert.equal(response.body.data.tasks.length, 1);
      assert.equal(response.body.data.tasks[0].title, 'Gamma deploy');
    });

    test('filters by priority', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?priority=urgent`);

      assert.equal(response.body.data.tasks.length, 1);
    });

    test('filters by assignee', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?assignee=${owner._id}`);

      assert.equal(response.body.data.tasks.length, 2);
    });

    test('filters for unassigned tasks', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?unassigned=true`);

      assert.equal(response.body.data.tasks.length, 1);
      assert.equal(response.body.data.tasks[0].title, 'Gamma deploy');
    });

    test('rejects assignee and unassigned together', async () => {
      const { client, tasksUrl, owner } = await setup();

      const response = await client.get(`${tasksUrl}?assignee=${owner._id}&unassigned=true`);

      assert.equal(response.status, 400);
    });

    test('filters by label', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const { label } = await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?labels=${label._id}`);

      assert.equal(response.body.data.tasks.length, 1);
      assert.equal(response.body.data.tasks[0].title, 'Beta docs');
    });

    test('filters by due date range', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?dueDateFrom=${days(0).toISOString()}`);

      assert.equal(response.body.data.tasks.length, 1);
      assert.equal(response.body.data.tasks[0].title, 'Alpha bug');
    });

    test('rejects an inverted date range', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.get(
        `${tasksUrl}?dueDateFrom=${days(5).toISOString()}&dueDateTo=${days(1).toISOString()}`
      );

      assert.equal(response.status, 400);
    });

    test('combines several filters', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(
        `${tasksUrl}?status=todo&priority=high&assignee=${owner._id}`
      );

      assert.equal(response.body.data.tasks.length, 1);
      assert.equal(response.body.data.tasks[0].title, 'Alpha bug');
    });
  });

  describe('search', () => {
    test('searches titles', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?search=deploy`);

      assert.equal(response.body.data.tasks.length, 1);
    });

    test('searches descriptions', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?search=readme`);

      assert.equal(response.body.data.tasks.length, 1);
    });

    test('is case-insensitive', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?search=DEPLOY`);

      assert.equal(response.body.data.tasks.length, 1);
    });

    test('treats regex metacharacters literally', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await seedTasks(project, owner);

      const response = await client.get(`${tasksUrl}?search=.*`);

      assert.equal(response.body.data.tasks.length, 0, 'a wildcard must not match everything');
    });

    test('rejects an empty search term', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.get(`${tasksUrl}?search=`);

      assert.equal(response.status, 400);
    });
  });

  describe('project filtering', () => {
    test('filters projects by status', async () => {
      const { client, projectsUrl, workspace, owner } = await setup();
      await createProject(workspace, owner, { name: 'Active One', status: 'active' });
      await createProject(workspace, owner, { name: 'Planning One', status: 'planning' });

      const response = await client.get(`${projectsUrl}?status=active`);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.projects.length, 1);
      assert.equal(response.body.data.projects[0].name, 'Active One');
    });

    test('searches projects by name', async () => {
      const { client, projectsUrl, workspace, owner } = await setup();
      await createProject(workspace, owner, { name: 'Apollo Mission' });
      await createProject(workspace, owner, { name: 'Borealis' });

      const response = await client.get(`${projectsUrl}?search=apollo`);

      assert.equal(response.body.data.projects.length, 1);
    });

    test('sorts projects by name', async () => {
      const { client, projectsUrl, workspace, owner } = await setup();
      await createProject(workspace, owner, { name: 'Zulu' });
      await createProject(workspace, owner, { name: 'Alpha' });

      const response = await client.get(`${projectsUrl}?sortBy=name&order=asc`);

      assert.equal(response.body.data.projects[0].name, 'Alpha');
    });

    test('rejects an invalid project status filter', async () => {
      const { client, projectsUrl } = await setup();

      const response = await client.get(`${projectsUrl}?status=not_a_status`);

      assert.equal(response.status, 400);
    });
  });

  describe('query injection', () => {
    const payloads = [
      '?status={"$ne":"todo"}',
      '?status=$where',
      '?sortBy={"$where":"1"}',
      '?assignee={"$gt":""}',
      '?labels={"$ne":null}',
      '?page={"$gt":0}',
      '?dueDateFrom={"$gt":"2000-01-01"}',
      '?limit=10; sleep(5000)',
    ];

    for (const payload of payloads) {
      test(`rejects ${payload}`, async () => {
        const { client, tasksUrl } = await setup();

        const response = await client.get(`${tasksUrl}${payload}`);

        assert.equal(response.status, 400);
      });
    }

    test('rejects a nested operator object', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.get(`${tasksUrl}?status[$ne]=todo`);

      // Express 5's simple parser turns this into the literal key
      // "status[$ne]", which is simply not a recognised parameter.
      assert.equal(response.status, 200);
      assert.equal(response.body.data.tasks.length, 0);
    });
  });
});
