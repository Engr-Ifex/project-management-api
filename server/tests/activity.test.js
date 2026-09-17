import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import { asUser, createTask, createUser, createWorkspace } from './helpers/factories.js';

let app;
let ProjectActivity;
let Project;

before(async () => {
  app = await startTestDatabase();
  ProjectActivity = (await import('../src/models/ProjectActivity.js')).default;
  Project = (await import('../src/models/Project.js')).default;
});

after(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearDatabase();
});

const API = '/api/v1';

/*
 * The audit trail is written by the API layer, so a project created directly
 * through the model produces no entries. This fixture therefore creates the
 * project through the API.
 */
const setup = async () => {
  const owner = await createUser({ name: 'Owner' });
  const workspace = await createWorkspace(owner);
  const client = asUser(app, owner);

  const created = await client
    .post(`${API}/workspaces/${workspace._id}/projects`)
    .send({ name: 'Audited Project' });

  const projectId = created.body.data.project._id;
  const project = await Project.findById(projectId);

  return {
    owner,
    workspace,
    project,
    client,
    activitiesUrl: `${API}/workspaces/${workspace._id}/projects/${project._id}/activities`,
  };
};

const seedActivity = (workspace, project, user, overrides = {}) =>
  ProjectActivity.create({
    workspace: workspace._id,
    project: project._id,
    user: user._id,
    action: 'task_created',
    metadata: {},
    ...overrides,
  });

describe('Activity / audit trail', () => {
  test('records project creation automatically', async () => {
    const { client, activitiesUrl } = await setup();

    const response = await client.get(activitiesUrl);

    assert.equal(response.status, 200);
    assert.ok(response.body.data.activities.length >= 1);
    assert.equal(response.body.data.activities[0].action, 'created');
  });

  test('records task creation automatically', async () => {
    const { client, workspace, project, activitiesUrl } = await setup();

    const created = await client
      .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`)
      .send({ title: 'Audited task' });

    assert.equal(created.status, 201);

    const response = await client.get(activitiesUrl);

    assert.ok(
      response.body.data.activities.some((entry) => entry.action === 'task_created'),
      'creating a task should add a task_created entry'
    );
  });

  test('returns newest first by default', async () => {
    const { client, workspace, project, owner, activitiesUrl } = await setup();

    await seedActivity(workspace, project, owner, { action: 'task_updated' });

    const response = await client.get(activitiesUrl);
    const dates = response.body.data.activities.map((entry) => new Date(entry.createdAt).getTime());

    for (let i = 1; i < dates.length; i += 1) {
      assert.ok(dates[i - 1] >= dates[i], 'activities should be ordered newest first');
    }
  });

  test('filters by action', async () => {
    const { client, workspace, project, owner, activitiesUrl } = await setup();

    await seedActivity(workspace, project, owner, { action: 'task_updated' });

    const response = await client.get(`${activitiesUrl}?action=task_updated`);

    assert.equal(response.status, 200);
    assert.ok(response.body.data.activities.length >= 1);
    assert.ok(response.body.data.activities.every((entry) => entry.action === 'task_updated'));
  });

  test('rejects an unknown action filter', async () => {
    const { client, activitiesUrl } = await setup();

    const response = await client.get(`${activitiesUrl}?action=not_a_real_action`);

    assert.equal(response.status, 400);
  });

  test('paginates the feed', async () => {
    const { client, workspace, project, owner, activitiesUrl } = await setup();

    for (let i = 0; i < 4; i += 1) {
      await seedActivity(workspace, project, owner, { action: 'task_updated' });
    }

    const response = await client.get(`${activitiesUrl}?limit=2`);

    assert.equal(response.body.data.activities.length, 2);
    assert.ok(response.body.data.pagination.total >= 4);
  });

  test('scopes the task feed to one task', async () => {
    const { client, workspace, project, owner } = await setup();
    const task = await createTask(project, owner);

    await seedActivity(workspace, project, owner, {
      action: 'task_updated',
      metadata: { taskId: task._id },
    });
    await seedActivity(workspace, project, owner, { action: 'task_created', metadata: {} });

    const response = await client.get(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/activities`
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.activities.length, 1);
    assert.equal(response.body.data.activities[0].action, 'task_updated');
  });

  test('an outsider cannot read another workspace\u2019s activity feed', async () => {
    const { workspace, project } = await setup();
    const outsider = await createUser({ name: 'Outsider' });

    const response = await asUser(app, outsider).get(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/activities`
    );

    assert.equal(response.status, 403);
  });

  test('requires authentication', async () => {
    const { activitiesUrl } = await setup();
    const { default: request } = await import('supertest');

    const response = await request(app).get(activitiesUrl);

    assert.equal(response.status, 401);
  });
});
