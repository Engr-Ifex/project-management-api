import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  addProjectMember,
  addWorkspaceMember,
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

const setup = async () => {
  const owner = await createUser({ name: 'Owner' });
  const workspace = await createWorkspace(owner);
  const project = await createProject(workspace, owner);

  return {
    owner,
    workspace,
    project,
    client: asUser(app, owner),
    labelsUrl: `${API}/workspaces/${workspace._id}/projects/${project._id}/labels`,
  };
};

describe('Labels', () => {
  test('creates a label', async () => {
    const { client, labelsUrl } = await setup();

    const response = await client.post(labelsUrl).send({ name: 'Bug', color: '#ff0000' });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.label.name, 'Bug');
  });

  test('rejects an invalid colour', async () => {
    const { client, labelsUrl } = await setup();

    const response = await client.post(labelsUrl).send({ name: 'Bad', color: 'red' });

    assert.equal(response.status, 400);
  });

  test('rejects an empty name', async () => {
    const { client, labelsUrl } = await setup();

    const response = await client.post(labelsUrl).send({ name: '', color: '#ff0000' });

    assert.equal(response.status, 400);
  });

  test('lists labels for a project', async () => {
    const { client, labelsUrl, project } = await setup();
    await createLabel(project, { name: 'One' });
    await createLabel(project, { name: 'Two' });

    const response = await client.get(labelsUrl);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.labels.length, 2);
  });

  test('retrieves a single label', async () => {
    const { client, labelsUrl, project } = await setup();
    const label = await createLabel(project, { name: 'Solo' });

    const response = await client.get(`${labelsUrl}/${label._id}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.label.name, 'Solo');
  });

  test('updates a label', async () => {
    const { client, labelsUrl, project } = await setup();
    const label = await createLabel(project);

    const response = await client
      .patch(`${labelsUrl}/${label._id}`)
      .send({ name: 'Renamed', color: '#00ff00' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.label.name, 'Renamed');
  });

  test('deletes a label', async () => {
    const { client, labelsUrl, project } = await setup();
    const label = await createLabel(project);

    const response = await client.delete(`${labelsUrl}/${label._id}`);

    assert.equal(response.status, 200);

    const listed = await client.get(labelsUrl);
    assert.equal(listed.body.data.labels.length, 0);
  });

  test('assigns a label to a task and removes it again', async () => {
    const { client, workspace, project, owner } = await setup();
    const label = await createLabel(project, { name: 'Assignable' });
    const task = await createTask(project, owner);
    const assignmentUrl = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/labels`;

    const assigned = await client.post(assignmentUrl).send({ labelId: String(label._id) });
    assert.equal(assigned.status, 200);

    const { default: Task } = await import('../src/models/Task.js');
    const withLabel = await Task.findById(task._id);
    assert.ok(withLabel.labels.some((id) => String(id) === String(label._id)));

    const removed = await client.delete(`${assignmentUrl}/${label._id}`);
    assert.equal(removed.status, 200);

    const withoutLabel = await Task.findById(task._id);
    assert.equal(withoutLabel.labels.length, 0);
  });

  test('returns 404 for an unknown label', async () => {
    const { client, labelsUrl } = await setup();

    const response = await client.get(`${labelsUrl}/000000000000000000000000`);

    assert.equal(response.status, 404);
  });

  test('a project member cannot create a label', async () => {
    const { workspace, project } = await setup();
    const member = await createUser({ name: 'Member' });
    await addWorkspaceMember(workspace, member, 'member');
    await addProjectMember(project, member, 'member');

    const response = await asUser(app, member)
      .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/labels`)
      .send({ name: 'Nope', color: '#ff0000' });

    assert.equal(response.status, 403);
  });
});
