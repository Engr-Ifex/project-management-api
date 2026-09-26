import { before, after, beforeEach, test } from 'node:test';
import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  asUser,
  createLabel,
  createProject,
  createTask,
  createUser,
  createWorkspace,
  addProjectMember,
  addWorkspaceMember,
} from './helpers/factories.js';

/*
 * Throwaway probe: verifies the specific claims the frontend integration map
 * makes that were read from code rather than observed. Not a regression suite.
 */

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
  const client = asUser(app, owner);

  return {
    owner,
    workspace,
    project,
    client,
    base: `${API}/workspaces/${workspace._id}/projects/${project._id}`,
  };
};

const say = (label, value) => console.log(`PROBE ${label} = ${value}`);

test('probe task field semantics', async () => {
  const { client, base } = await setup();

  const created = await client.post(`${base}/tasks`).send({
    title: 'Task',
    estimatedTime: 90,
    dueDate: '2026-10-01T00:00:00.000Z',
    startDate: '2026-09-25T00:00:00.000Z',
  });

  say('POST task status', created.status);
  say('estimatedTime echoed', created.body.data.task.estimatedTime);
  say('dueDate echoed', created.body.data.task.dueDate);

  const taskId = created.body.data.task._id;

  // Clear the dates with null.
  const cleared = await client
    .patch(`${base}/tasks/${taskId}/due-date`)
    .send({ dueDate: null });
  say('dueDate null -> status', cleared.status);
  say('dueDate after null', cleared.body.data.task.dueDate);

  const startCleared = await client
    .patch(`${base}/tasks/${taskId}/start-date`)
    .send({ startDate: null });
  say('startDate null -> status', startCleared.status);

  // Unassign with null.
  const unassigned = await client
    .patch(`${base}/tasks/${taskId}/assignee`)
    .send({ assignee: null });
  say('assignee null -> status', unassigned.status);
  say('assignee after null', unassigned.body.data.task.assignee);
});

test('probe assigning a non-member', async () => {
  const { owner, workspace, project, client, base } = await setup();
  const outsider = await createUser({ name: 'Outsider' });

  const created = await client.post(`${base}/tasks`).send({ title: 'Task' });

  const res = await client
    .patch(`${base}/tasks/${created.body.data.task._id}/assignee`)
    .send({ assignee: String(outsider._id) });

  say('assign non-workspace-member -> status', res.status);
  say('assign non-workspace-member -> message', res.body.message);

  // Now a workspace member who is NOT on the project.
  await addWorkspaceMember(workspace, outsider, 'member');

  const res2 = await client
    .patch(`${base}/tasks/${created.body.data.task._id}/assignee`)
    .send({ assignee: String(outsider._id) });

  say('assign workspace-member-not-project-member -> status', res2.status);
  say('  message', res2.body.message);

  // And a genuine project member.
  await addProjectMember(project, outsider, 'member');

  const res3 = await client
    .patch(`${base}/tasks/${created.body.data.task._id}/assignee`)
    .send({ assignee: String(outsider._id) });

  say('assign project-member -> status', res3.status);
});

test('probe comment delete semantics', async () => {
  const { client, base } = await setup();

  const task = await client.post(`${base}/tasks`).send({ title: 'Task' });
  const taskId = task.body.data.task._id;

  const created = await client
    .post(`${base}/tasks/${taskId}/comments`)
    .send({ content: 'Hello' });

  say('POST comment status', created.status);
  say('POST comment data key', Object.keys(created.body.data).join(','));

  const commentId = created.body.data.comment._id;

  const deleted = await client.delete(`${base}/tasks/${taskId}/comments/${commentId}`);
  say('DELETE comment status', deleted.status);

  const list = await client.get(`${base}/tasks/${taskId}/comments`);
  say('comment still listed after delete', list.body.data.comments.length);
  say('isDeleted flag', JSON.stringify(list.body.data.comments[0]?.isDeleted));

  const fetched = await client.get(`${base}/tasks/${taskId}/comments/${commentId}`);
  say('GET deleted comment status', fetched.status);
});

test('probe label uniqueness status code', async () => {
  const { project, client, base } = await setup();

  await createLabel(project, { name: 'Bug' });

  const dupe = await client.post(`${base}/labels`).send({ name: 'Bug', color: '#ff0000' });

  say('duplicate label name -> status', dupe.status);
  say('duplicate label name -> message', dupe.body.message);

  const list = await client.get(`${base}/labels`);
  say('labels list data keys', Object.keys(list.body.data).join(','));
});

test('probe comment edit permission for a non-author project owner', async () => {
  const { owner, workspace, project, client, base } = await setup();

  const member = await createUser({ name: 'Member' });
  await addWorkspaceMember(workspace, member, 'member');
  await addProjectMember(project, member, 'member');

  const task = await client.post(`${base}/tasks`).send({ title: 'Task' });
  const taskId = task.body.data.task._id;

  const created = await asUser(app, member)
    .post(`${base}/tasks/${taskId}/comments`)
    .send({ content: 'Member comment' });

  const commentId = created.body.data.comment._id;

  // The project OWNER (also workspace owner) tries to edit someone else's comment.
  const edit = await client
    .patch(`${base}/tasks/${taskId}/comments/${commentId}`)
    .send({ content: 'Edited by owner' });

  say('owner edits another author comment -> status', edit.status);
  say('  message', edit.body.message);

  // But the owner CAN delete it.
  const del = await client.delete(`${base}/tasks/${taskId}/comments/${commentId}`);
  say('owner deletes another author comment -> status', del.status);
});

test('probe unread count and workspace list', async () => {
  const { owner, client } = await setup();

  const count = await client.get(`${API}/notifications/unread/count`);
  say('unread count status', count.status);
  say('unread count data', JSON.stringify(count.body.data));

  const workspaces = await client.get(`${API}/workspaces`);
  say('workspaces list data keys', Object.keys(workspaces.body.data).join(','));
  say('workspace id key', Object.keys(workspaces.body.data.workspaces[0]).includes('id') ? 'id' : '?');
  say('workspace has _id?', Object.keys(workspaces.body.data.workspaces[0]).includes('_id'));

  const user = await client.get(`${API}/users/profile`);
  say('profile id key', Object.keys(user.body.data.user).includes('id') ? 'id' : '?');
});

test('probe task id key and project members key', async () => {
  const { client, base, workspace, project } = await setup();

  const task = await client.post(`${base}/tasks`).send({ title: 'Task' });

  say('task id key', Object.keys(task.body.data.task).includes('_id') ? '_id' : '?');
  say('task has id?', Object.keys(task.body.data.task).includes('id'));

  const projectRes = await client.get(`${base}`);
  say('project id key', Object.keys(projectRes.body.data.project).includes('_id') ? '_id' : '?');
  say('project members present for owner', Array.isArray(projectRes.body.data.project.members));
});
