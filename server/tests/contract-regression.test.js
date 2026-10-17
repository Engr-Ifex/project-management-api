import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startTestDatabase,
  clearDatabase,
  stopTestDatabase,
  isUsingRealDatabase,
} from './helpers/setup.js';
import {
  asUser,
  createLabel,
  createProject,
  createTask,
  createUser,
  createWorkspace,
  uniqueEmail,
} from './helpers/factories.js';

/*
 * Contract regression tests.
 *
 * Each test pins a response-shape contract that was previously wrong in the
 * OpenAPI spec or the frontend types and has since been corrected.  The tests
 * guard against silent regressions: if someone changes the backend or
 * regenerates the spec, these assertions catch the drift.
 *
 * Covered discrepancies:
 *   1. Invitation response includes `token` (the only acceptance path).
 *   2. Labels list response includes a `pagination` object.
 *   3. Task labels are populated objects `{_id, name, color}`, not bare ids.
 *   4. Dashboard workspace/project are reduced shapes, not full documents.
 *   5. PATCH /notifications/read-all returns `{modified}`, not `{count}`.
 */

let app;
let Notification;

before(async () => {
  app = await startTestDatabase();
  Notification = (await import('../src/models/Notification.js')).default;
});

after(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearDatabase();
});

const API = '/api/v1';

describe('Contract regression', () => {
  const setup = async () => {
    const owner = await createUser({ name: 'Owner' });
    const workspace = await createWorkspace(owner);
    const project = await createProject(workspace, owner);

    return {
      owner,
      workspace,
      project,
      client: asUser(app, owner),
    };
  };

  /* ---------------------------------------------------------------- *\
   * 1. Invitation response includes `token`
  \* ---------------------------------------------------------------- */
  describe('invitation response', () => {
    test('includes the token so the invitee can accept', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const inviteeEmail = uniqueEmail('invitee');

      const response = await asUser(app, owner)
        .post(`${API}/workspaces/${workspace._id}/invitations`)
        .send({ email: inviteeEmail, role: 'member' });

      assert.equal(response.status, 201);
      assert.ok(response.body.data.invitation, 'invitation object must be present');
      assert.ok(response.body.data.invitation.token, 'token must be present in the response');
      assert.match(
        response.body.data.invitation.token,
        /^[0-9a-f]{64}$/,
        'token is a 64-character hex string'
      );
    });
  });

  /* ---------------------------------------------------------------- *\
   * 2. Labels list response includes `pagination`
  \* ---------------------------------------------------------------- */
  describe('labels list', () => {
    test('includes a pagination object alongside the labels array', async () => {
      const { client, workspace, project } = await setup();
      const labelsUrl = `${API}/workspaces/${workspace._id}/projects/${project._id}/labels`;

      await createLabel(project, { name: 'One' });
      await createLabel(project, { name: 'Two' });

      const response = await client.get(labelsUrl);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.labels.length, 2);
      assert.ok(response.body.data.pagination, 'pagination object must be present');
      assert.equal(typeof response.body.data.pagination.total, 'number');
      assert.equal(response.body.data.pagination.total, 2);
      assert.equal(typeof response.body.data.pagination.page, 'number');
      assert.equal(typeof response.body.data.pagination.limit, 'number');
    });
  });

  /* ---------------------------------------------------------------- *\
   * 3. Task labels are populated objects, not bare ObjectIds
  \* ---------------------------------------------------------------- */
  describe('task labels', () => {
    test('are populated objects with _id, name and colour — not bare ids', async () => {
      const { client, workspace, project, owner } = await setup();
      const label = await createLabel(project, { name: 'Bug', color: '#ff0000' });
      const task = await createTask(project, owner);
      const tasksUrl = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`;
      const assignmentUrl = `${tasksUrl}/${task._id}/labels`;

      const assigned = await client.post(assignmentUrl).send({ labelId: String(label._id) });
      assert.equal(assigned.status, 200);

      const retrieved = await client.get(`${tasksUrl}/${task._id}`);
      assert.equal(retrieved.status, 200);

      const labels = retrieved.body.data.task.labels;
      assert.ok(Array.isArray(labels), 'labels is an array');
      assert.equal(labels.length, 1);

      /*
       * The in-process store does not populate arrays of references the way
       * real MongoDB does (see memoryStore.js). Against a real database the
       * label is a populated object {_id, name, color}; against the store it
       * is the bare id string. Both confirm the label was attached; only a
       * real database run proves the populate shape. The OpenAPI LabelRef
       * schema is what pins the contract for the store-only run.
       */
      if (isUsingRealDatabase()) {
        const entry = labels[0];

        assert.equal(typeof entry, 'object', 'label entry is an object, not a string');
        assert.ok(entry._id, 'label has _id');
        assert.equal(entry.name, 'Bug');
        assert.equal(entry.color, '#ff0000');
      } else {
        // The label id is present on the task regardless of populate mode.
        assert.ok(String(labels[0]) === String(label._id), 'the assigned label id is on the task');
      }
    });
  });

  /* ---------------------------------------------------------------- *\
   * 4. Dashboard reduced shapes
  \* ---------------------------------------------------------------- */
  describe('dashboard reduced shapes', () => {
    test('workspace dashboard returns workspace as {id, name} only', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      await createProject(workspace, owner);

      const response = await asUser(app, owner).get(`${API}/workspaces/${workspace._id}/dashboard`);

      assert.equal(response.status, 200);
      const ws = response.body.data.workspace;
      assert.ok(ws, 'workspace must be present');
      assert.deepEqual(
        Object.keys(ws).sort(),
        ['id', 'name'],
        'workspace must have exactly id and name'
      );
    });

    test('project dashboard returns project as {id, name, status} only', async () => {
      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const project = await createProject(workspace, owner, { status: 'active' });

      const response = await asUser(app, owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard`
      );

      assert.equal(response.status, 200);
      const proj = response.body.data.project;
      assert.ok(proj, 'project must be present');
      assert.deepEqual(
        Object.keys(proj).sort(),
        ['id', 'name', 'status'],
        'project must have exactly id, name and status'
      );
      assert.equal(proj.status, 'active');
    });
  });

  /* ---------------------------------------------------------------- *\
   * 5. PATCH /notifications/read-all returns {modified}, not {count}
  \* ---------------------------------------------------------------- */
  describe('mark-all-read response', () => {
    test('returns {modified: N}, not {count: N}', async () => {
      const user = await createUser();
      await Notification.create({
        recipient: user._id,
        type: 'task_assigned',
        title: 'One',
        message: '',
        isRead: false,
      });
      await Notification.create({
        recipient: user._id,
        type: 'task_assigned',
        title: 'Two',
        message: '',
        isRead: false,
      });

      const response = await asUser(app, user).patch(`${API}/notifications/read-all`);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.modified, 2, 'modified is the count of updated docs');
      assert.equal(response.body.data.count, undefined, 'the old count key must not appear');
    });
  });
});
