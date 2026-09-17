import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  addProjectMember,
  addWorkspaceMember,
  asUser,
  createComment,
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
  const task = await createTask(project, owner);

  return {
    owner,
    workspace,
    project,
    task,
    client: asUser(app, owner),
    commentsUrl: `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/comments`,
  };
};

describe('Comments', () => {
  test('creates a comment', async () => {
    const { client, commentsUrl } = await setup();

    const response = await client.post(commentsUrl).send({ content: 'First comment' });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.comment.content, 'First comment');
  });

  test('rejects an empty comment', async () => {
    const { client, commentsUrl } = await setup();

    const response = await client.post(commentsUrl).send({ content: '' });

    assert.equal(response.status, 400);
  });

  test('rejects a comment over the length limit', async () => {
    const { client, commentsUrl } = await setup();

    const response = await client.post(commentsUrl).send({ content: 'x'.repeat(2001) });

    assert.equal(response.status, 400);
  });

  test('lists comments oldest first', async () => {
    const { client, commentsUrl, task, owner } = await setup();
    await createComment(task, owner, { content: 'First' });
    await createComment(task, owner, { content: 'Second' });

    const response = await client.get(commentsUrl);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.comments.length, 2);
    assert.equal(response.body.data.comments[0].content, 'First');
  });

  test('retrieves a single comment', async () => {
    const { client, commentsUrl, task, owner } = await setup();
    const comment = await createComment(task, owner, { content: 'Mine' });

    const response = await client.get(`${commentsUrl}/${comment._id}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.comment.content, 'Mine');
  });

  test('updates a comment', async () => {
    const { client, commentsUrl, task, owner } = await setup();
    const comment = await createComment(task, owner);

    const response = await client
      .patch(`${commentsUrl}/${comment._id}`)
      .send({ content: 'Edited' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.comment.content, 'Edited');
  });

  test('deletes a comment and hides it from the list', async () => {
    const { client, commentsUrl, task, owner } = await setup();
    const comment = await createComment(task, owner);

    const removed = await client.delete(`${commentsUrl}/${comment._id}`);
    assert.equal(removed.status, 200);

    const listed = await client.get(commentsUrl);
    assert.equal(listed.body.data.comments.length, 0);
  });

  test('returns 404 for an unknown comment', async () => {
    const { client, commentsUrl } = await setup();

    const response = await client.get(`${commentsUrl}/000000000000000000000000`);

    assert.equal(response.status, 404);
  });

  test('a project member can comment', async () => {
    const { workspace, project, task } = await setup();
    const member = await createUser({ name: 'Member' });
    await addWorkspaceMember(workspace, member, 'member');
    await addProjectMember(project, member, 'member');

    const response = await asUser(app, member)
      .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/comments`)
      .send({ content: 'Member comment' });

    assert.equal(response.status, 201);
  });

  test('a member of a project cannot comment on another project\u2019s task', async () => {
    const { owner, workspace, project } = await setup();
    const otherProject = await createProject(workspace, owner, { name: 'Other' });
    const otherTask = await createTask(otherProject, owner);

    const member = await createUser({ name: 'Member' });
    await addWorkspaceMember(workspace, member, 'member');
    await addProjectMember(project, member, 'member');

    // The task belongs to `otherProject`, reached through `project`'s URL.
    const response = await asUser(app, member)
      .post(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${otherTask._id}/comments`
      )
      .send({ content: 'Wrong project' });

    assert.equal(response.status, 404);
  });
});
