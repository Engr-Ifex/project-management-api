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
  addProjectMember,
  addWorkspaceMember,
} from './helpers/factories.js';

/*
 * Concurrency invariants.
 *
 * Every operation here used to be a read → decide → `save()` sequence, so two
 * overlapping requests could both pass the check and both write. The fixes
 * replace that with a conditional update whose guard is part of the write
 * (`{ 'members.user': { $ne: id } }`, `$addToSet`, `$pull`, `arrayFilters`), so
 * the database decides the winner instead of the application.
 *
 * WHAT THESE TESTS DO AND DO NOT PROVE.
 *
 * They fire genuinely overlapping requests and assert the invariant that must
 * hold whatever order the writes land in — exactly one owner, one membership
 * entry, one label attachment, no lost subtask.
 *
 * They cannot prove MongoDB's atomicity itself. The suite runs against an
 * in-process store (see `tests/helpers/memoryStore.js`), which emulates the
 * operators but executes one operation at a time, so a lost update can only
 * appear if the application logic is wrong. The atomicity of a single-document
 * update is a MongoDB guarantee; `TEST_DB=mongodb` against a real deployment is
 * what exercises it end to end.
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

/*
 * Models are imported inside the tests, after `startTestDatabase()` has
 * installed the store — the same pattern the other suites use. Importing them
 * at module scope would resolve them before the store is in place.
 */
const model = async (name) => (await import(`../src/models/${name}.js`)).default;

describe('Concurrency', () => {
  describe('invitation acceptance', () => {
    test('two overlapping accepts produce exactly one membership', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const invitee = await createUser({ name: 'Invitee' });

      const token = 'a'.repeat(64);

      await (
        await model('Invitation')
      ).create({
        workspace: workspace._id,
        invitedBy: owner._id,
        email: invitee.email,
        role: 'member',
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const accept = () =>
        asUser(app, invitee).patch(`${API}/invitations/${token}/accept`).send({});

      const responses = await Promise.all([accept(), accept()]);

      const succeeded = responses.filter((response) => response.status === 200);

      assert.equal(succeeded.length, 1, 'exactly one accept may succeed');

      const stored = await (await model('Workspace')).findById(workspace._id);
      const entries = stored.members.filter(
        (member) => String(member.user) === String(invitee._id)
      );

      assert.equal(entries.length, 1, 'the invitee must appear exactly once');
    });

    test('a consumed invitation cannot be accepted twice in sequence', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const invitee = await createUser({ name: 'Invitee' });

      const token = 'b'.repeat(64);

      await (
        await model('Invitation')
      ).create({
        workspace: workspace._id,
        invitedBy: owner._id,
        email: invitee.email,
        role: 'member',
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const first = await asUser(app, invitee).patch(`${API}/invitations/${token}/accept`).send({});
      const second = await asUser(app, invitee)
        .patch(`${API}/invitations/${token}/accept`)
        .send({});

      assert.equal(first.status, 200);
      assert.equal(second.status, 404, 'the invitation is no longer pending');
    });
  });

  describe('label assignment', () => {
    test('two overlapping assigns attach the label once', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);
      const task = await createTask(project, owner);
      const label = await createLabel(project, { name: 'Concurrent' });

      const url = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/labels`;

      const assign = () =>
        asUser(app, owner)
          .post(url)
          .send({ labelId: String(label._id) });

      const responses = await Promise.all([assign(), assign()]);

      assert.equal(
        responses.filter((response) => response.status === 200).length,
        1,
        'only one assign may report success'
      );

      const stored = await (await model('Task')).findById(task._id);

      assert.equal(stored.labels.length, 1, 'the label must be attached exactly once');
    });

    test('an overlapping assign and remove leave a consistent state', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);
      const task = await createTask(project, owner);
      const label = await createLabel(project, { name: 'Contested' });

      const url = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/labels`;

      await asUser(app, owner)
        .post(url)
        .send({ labelId: String(label._id) });

      await Promise.all([
        asUser(app, owner)
          .post(url)
          .send({ labelId: String(label._id) }),
        asUser(app, owner).delete(`${url}/${label._id}`),
      ]);

      const stored = await (await model('Task')).findById(task._id);
      const occurrences = stored.labels.filter((id) => String(id) === String(label._id)).length;

      assert.ok(
        occurrences === 0 || occurrences === 1,
        `the label must be attached zero or one times, not ${occurrences}`
      );
    });
  });

  describe('project membership', () => {
    test('two overlapping adds produce exactly one member entry', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);
      const member = await createUser({ name: 'Member' });

      await addWorkspaceMember(workspace, member, 'member');

      const url = `${API}/workspaces/${workspace._id}/projects/${project._id}/members`;

      const add = () =>
        asUser(app, owner)
          .post(url)
          .send({ userId: String(member._id), role: 'member' });

      const responses = await Promise.all([add(), add()]);

      assert.equal(
        responses.filter((response) => response.status === 200).length,
        1,
        'only one add may report success'
      );

      const stored = await (await model('Project')).findById(project._id);
      const entries = stored.members.filter((entry) => String(entry.user) === String(member._id));

      assert.equal(entries.length, 1, 'the member must appear exactly once');
    });

    test('a concurrent role change is not lost by another member change', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);
      const first = await createUser({ name: 'First' });
      const second = await createUser({ name: 'Second' });

      await addWorkspaceMember(workspace, first, 'member');
      await addWorkspaceMember(workspace, second, 'member');
      await addProjectMember(project, first, 'member');
      await addProjectMember(project, second, 'member');

      const base = `${API}/workspaces/${workspace._id}/projects/${project._id}/members`;

      await Promise.all([
        asUser(app, owner).patch(`${base}/${first._id}/role`).send({ role: 'viewer' }),
        asUser(app, owner).patch(`${base}/${second._id}/role`).send({ role: 'admin' }),
      ]);

      const stored = await (await model('Project')).findById(project._id);
      const roleOf = (id) =>
        stored.members.find((entry) => String(entry.user) === String(id))?.role;

      assert.equal(roleOf(first._id), 'viewer', 'the first role change must survive');
      assert.equal(roleOf(second._id), 'admin', 'the second role change must survive');
    });
  });

  describe('workspace ownership', () => {
    test('two overlapping transfers leave exactly one owner', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const first = await createUser({ name: 'First' });
      const second = await createUser({ name: 'Second' });

      await addWorkspaceMember(workspace, first, 'member');
      await addWorkspaceMember(workspace, second, 'member');

      const url = `${API}/workspaces/${workspace._id}/transfer-ownership`;

      await Promise.all([
        asUser(app, owner)
          .patch(url)
          .send({ userId: String(first._id) }),
        asUser(app, owner)
          .patch(url)
          .send({ userId: String(second._id) }),
      ]);

      const stored = await (await model('Workspace')).findById(workspace._id);
      const owners = stored.members.filter((member) => member.role === 'owner');

      assert.equal(owners.length, 1, 'there must never be two owners');
      assert.equal(
        String(stored.owner),
        String(owners[0].user),
        'the owner field must agree with the members array'
      );
    });

    test('a transfer moves the role to exactly one new owner', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const successor = await createUser({ name: 'Successor' });

      await addWorkspaceMember(workspace, successor, 'member');

      const response = await asUser(app, owner)
        .patch(`${API}/workspaces/${workspace._id}/transfer-ownership`)
        .send({ userId: String(successor._id) });

      assert.equal(response.status, 200);

      const stored = await (await model('Workspace')).findById(workspace._id);
      const roleOf = (id) =>
        stored.members.find((member) => String(member.user) === String(id))?.role;

      assert.equal(roleOf(successor._id), 'owner');
      assert.equal(roleOf(owner._id), 'admin', 'the previous owner steps down to admin');
      assert.equal(String(stored.owner), String(successor._id));
    });
  });

  describe('subtasks', () => {
    test('two overlapping appends both survive', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);
      const task = await createTask(project, owner);

      const url = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/subtasks`;

      const add = (title) => asUser(app, owner).post(url).send({ title });

      await Promise.all([add('First subtask'), add('Second subtask')]);

      const stored = await (await model('Task')).findById(task._id);
      const titles = stored.subtasks.map((subtask) => subtask.title).sort();

      assert.deepEqual(titles, ['First subtask', 'Second subtask']);
    });

    test('two overlapping edits to different subtasks both survive', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);
      const task = await createTask(project, owner);

      const url = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/subtasks`;

      const created = await asUser(app, owner).post(url).send({ title: 'First' });
      assert.equal(created.status, 201);

      const second = await asUser(app, owner).post(url).send({ title: 'Second' });
      assert.equal(second.status, 201);

      const stored = await (await model('Task')).findById(task._id);
      const [a, b] = stored.subtasks;

      await Promise.all([
        asUser(app, owner).patch(`${url}/${a._id}`).send({ isCompleted: true }),
        asUser(app, owner).patch(`${url}/${b._id}`).send({ title: 'Second renamed' }),
      ]);

      const after = await (await model('Task')).findById(task._id);
      const byId = (id) => after.subtasks.find((subtask) => String(subtask._id) === String(id));

      assert.equal(byId(a._id).isCompleted, true, 'the completion must survive');
      assert.equal(byId(b._id).title, 'Second renamed', 'the rename must survive');
    });
  });

  describe('task ordering', () => {
    test('overlapping creates keep a stable, total order', async () => {
      const owner = await createUser({ name: 'Owner' });
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner);

      const url = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`;

      await Promise.all([
        asUser(app, owner).post(url).send({ title: 'Task one' }),
        asUser(app, owner).post(url).send({ title: 'Task two' }),
        asUser(app, owner).post(url).send({ title: 'Task three' }),
      ]);

      const order = async () => {
        const response = await asUser(app, owner).get(url);

        return response.body.data.tasks.map((task) => String(task._id));
      };

      const first = await order();
      const second = await order();

      assert.equal(first.length, 3, 'all three tasks exist');
      assert.deepEqual(first, second, 'the order must not change between reads');
      assert.equal(new Set(first).size, 3, 'no task may be repeated');
    });
  });
});
