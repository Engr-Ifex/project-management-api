import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
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
  };
};

const days = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe('Tasks', () => {
  describe('creation', () => {
    test('creates a task with defaults', async () => {
      const { client, tasksUrl, owner } = await setup();

      const response = await client.post(tasksUrl).send({ title: 'First task' });

      assert.equal(response.status, 201);
      assert.equal(response.body.data.task.title, 'First task');
      assert.equal(response.body.data.task.status, 'todo');
      assert.equal(response.body.data.task.priority, 'medium');
      assert.equal(response.body.data.task.estimatedTime, 0);
      assert.equal(
        String(response.body.data.task.createdBy.id ?? response.body.data.task.createdBy),
        String(owner._id)
      );
    });

    test('creates a task with every optional field', async () => {
      const { client, tasksUrl, owner } = await setup();

      const response = await client.post(tasksUrl).send({
        title: 'Full task',
        description: 'A description',
        assignee: String(owner._id),
        priority: 'high',
        estimatedTime: 120,
        startDate: days(1).toISOString(),
        dueDate: days(5).toISOString(),
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.data.task.priority, 'high');
      assert.equal(response.body.data.task.estimatedTime, 120);
      assert.equal(response.body.data.task.description, 'A description');
    });

    test('assigns sequential positions', async () => {
      const { client, tasksUrl } = await setup();

      const first = await client.post(tasksUrl).send({ title: 'One' });
      const second = await client.post(tasksUrl).send({ title: 'Two' });

      assert.equal(second.body.data.task.position, first.body.data.task.position + 1);
    });

    test('rejects a title that is too short', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.post(tasksUrl).send({ title: 'x' });

      assert.equal(response.status, 400);
    });

    test('rejects an invalid priority', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client
        .post(tasksUrl)
        .send({ title: 'Bad priority', priority: 'critical' });

      assert.equal(response.status, 400);
    });

    test('rejects a negative estimated time', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.post(tasksUrl).send({ title: 'Negative', estimatedTime: -30 });

      assert.equal(response.status, 400);
    });

    test('rejects a fractional estimated time', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client
        .post(tasksUrl)
        .send({ title: 'Fractional', estimatedTime: 1.5 });

      assert.equal(response.status, 400);
    });

    test('accepts an estimated time of zero', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client
        .post(tasksUrl)
        .send({ title: 'Zero estimate', estimatedTime: 0 });

      assert.equal(response.status, 201);
      assert.equal(response.body.data.task.estimatedTime, 0);
    });
  });

  describe('retrieval', () => {
    test('lists the project tasks', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await createTask(project, owner, { title: 'Task A' });
      await createTask(project, owner, { title: 'Task B' });

      const response = await client.get(tasksUrl);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.tasks.length, 2);
    });

    test('excludes archived tasks by default', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      await createTask(project, owner, { title: 'Live' });
      await createTask(project, owner, { title: 'Gone', isArchived: true });

      const response = await client.get(tasksUrl);

      assert.equal(response.body.data.tasks.length, 1);
    });

    test('returns a single task', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner, { title: 'Single' });

      const response = await client.get(`${tasksUrl}/${task._id}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.task.title, 'Single');
    });

    test('returns 404 for an unknown task', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.get(`${tasksUrl}/000000000000000000000000`);

      assert.equal(response.status, 404);
    });

    test('returns 400 for a malformed task id', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client.get(`${tasksUrl}/not-an-id`);

      assert.equal(response.status, 400);
    });
  });

  describe('update', () => {
    test('updates title, description and estimated time', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}`)
        .send({ title: 'Renamed', description: 'Updated', estimatedTime: 90 });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.task.title, 'Renamed');
      assert.equal(response.body.data.task.estimatedTime, 90);
    });

    test('rejects an empty update body', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client.patch(`${tasksUrl}/${task._id}`).send({});

      assert.equal(response.status, 400);
    });

    test('rejects an invalid estimated time on update', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const negative = await client.patch(`${tasksUrl}/${task._id}`).send({ estimatedTime: -5 });
      const fractional = await client.patch(`${tasksUrl}/${task._id}`).send({ estimatedTime: 2.5 });

      assert.equal(negative.status, 400);
      assert.equal(fractional.status, 400);
    });
  });

  /*
   * The update contract, and why it is split in two.
   *
   * `PATCH /tasks/:taskId` is validated by `updateTaskSchema`, which covers only
   * title, description, dates and estimate. Status, priority and assignee each
   * have their own route and their own schema. Zod strips unknown keys, so a
   * body carrying `status` to the generic PATCH arrives empty and trips the
   * "at least one field must be provided" refinement — a 400.
   *
   * These tests exist because the frontend sent all three to the generic PATCH.
   * TypeScript allowed it — structural typing permits extra properties when the
   * object is passed as a variable rather than a fresh literal — so it compiled,
   * every request 400'd, and the UI simply appeared not to save. The split is
   * deliberate, so it is pinned here rather than widened to hide the mistake.
   */
  describe('update contract', () => {
    test('the generic PATCH does not accept status, priority or assignee', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const bodies = [
        { status: 'completed' },
        { priority: 'urgent' },
        { assignee: String(owner._id) },
      ];

      for (const body of bodies) {
        const response = await client.patch(`${tasksUrl}/${task._id}`).send(body);

        assert.equal(
          response.status,
          400,
          `${Object.keys(body)[0]} must go to its own endpoint, not the generic PATCH`
        );
      }
    });

    test('the generic PATCH accepts a full ISO datetime for the due date', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}`)
        .send({ dueDate: '2026-10-12T00:00:00.000Z' });

      assert.equal(response.status, 200);
      assert.equal(
        new Date(response.body.data.task.dueDate).toISOString(),
        '2026-10-12T00:00:00.000Z'
      );
    });

    test('a date-only due date is rejected, which is why the client converts it', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      // Exactly what `<input type="date">` produces, and what the client used
      // to send verbatim: `z.string().datetime()` requires a time and a zone.
      const response = await client
        .patch(`${tasksUrl}/${task._id}`)
        .send({ dueDate: '2026-10-12' });

      assert.equal(response.status, 400);
    });
  });

  describe('creation contract', () => {
    test('accepts a full ISO due date, and omits it cleanly when absent', async () => {
      const { client, tasksUrl } = await setup();

      // The case that always worked: no due date means the key is not sent.
      const withoutDate = await client.post(tasksUrl).send({ title: 'No due date' });
      assert.equal(withoutDate.status, 201);
      assert.equal(withoutDate.body.data.task.dueDate, null);

      const withDate = await client
        .post(tasksUrl)
        .send({ title: 'With due date', dueDate: '2026-10-12T00:00:00.000Z' });

      assert.equal(withDate.status, 201);
      assert.equal(
        new Date(withDate.body.data.task.dueDate).toISOString(),
        '2026-10-12T00:00:00.000Z'
      );
    });

    test('rejects a date-only due date, the payload the client used to send', async () => {
      const { client, tasksUrl } = await setup();

      const response = await client
        .post(tasksUrl)
        .send({ title: 'Date only', dueDate: '2026-10-12' });

      assert.equal(response.status, 400);
    });
  });

  describe('status and priority', () => {
    test('updates the status through each allowed value', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      for (const status of ['in_progress', 'in_review', 'completed', 'cancelled', 'todo']) {
        const response = await client.patch(`${tasksUrl}/${task._id}/status`).send({ status });
        assert.equal(response.status, 200, `status ${status} should be accepted`);
        assert.equal(response.body.data.task.status, status);
      }
    });

    test('rejects an invalid status', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}/status`)
        .send({ status: 'done' });

      assert.equal(response.status, 400);
    });

    test('updates the priority', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}/priority`)
        .send({ priority: 'urgent' });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.task.priority, 'urgent');
    });

    test('rejects an invalid priority', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}/priority`)
        .send({ priority: 'later' });

      assert.equal(response.status, 400);
    });
  });

  describe('assignment', () => {
    test('assigns a project member', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}/assignee`)
        .send({ assignee: String(owner._id) });

      assert.equal(response.status, 200);
    });

    test('rejects assigning a non-member', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);
      const stranger = await createUser({ name: 'Stranger' });

      const response = await client
        .patch(`${tasksUrl}/${task._id}/assignee`)
        .send({ assignee: String(stranger._id) });

      assert.equal(response.status, 400);
    });

    test('unassigns with null', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner, { assignee: owner._id });

      const response = await client
        .patch(`${tasksUrl}/${task._id}/assignee`)
        .send({ assignee: null });

      assert.equal(response.status, 200);
    });
  });

  describe('dates', () => {
    test('sets and clears the due date', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const set = await client
        .patch(`${tasksUrl}/${task._id}/due-date`)
        .send({ dueDate: days(3).toISOString() });
      assert.equal(set.status, 200);

      const cleared = await client
        .patch(`${tasksUrl}/${task._id}/due-date`)
        .send({ dueDate: null });
      assert.equal(cleared.status, 200);
    });

    test('sets the start date', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}/start-date`)
        .send({ startDate: days(1).toISOString() });

      assert.equal(response.status, 200);
    });

    test('rejects a malformed date', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}/due-date`)
        .send({ dueDate: 'next tuesday' });

      assert.equal(response.status, 400);
    });
  });

  describe('archive and restore', () => {
    test('archives and restores a task', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const archived = await client.patch(`${tasksUrl}/${task._id}/archive`);
      assert.equal(archived.status, 200);

      const hidden = await client.get(`${tasksUrl}/${task._id}`);
      assert.equal(hidden.status, 404);

      const restored = await client.patch(`${tasksUrl}/${task._id}/restore`);
      assert.equal(restored.status, 200);

      const visible = await client.get(`${tasksUrl}/${task._id}`);
      assert.equal(visible.status, 200);
    });
  });

  describe('subtasks', () => {
    test('creates, lists, updates and deletes subtasks', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);
      const subtasksUrl = `${tasksUrl}/${task._id}/subtasks`;

      const created = await client.post(subtasksUrl).send({ title: 'Step one' });
      assert.equal(created.status, 201);

      const listed = await client.get(subtasksUrl);
      assert.equal(listed.status, 200);
      assert.equal(listed.body.data.subtasks.length, 1);
      assert.equal(listed.body.data.subtasks[0].title, 'Step one');
      assert.equal(listed.body.data.subtasks[0].isCompleted, false);

      /*
       * The subtask id is taken from the list rather than from the create
       * response: `POST /subtasks` returns the PARENT TASK under the `subtask`
       * key, while `PATCH` returns the subtask itself. The inconsistency is
       * recorded in the audit summary.
       */
      const subtaskId = listed.body.data.subtasks[0]._id;

      const updated = await client.patch(`${subtasksUrl}/${subtaskId}`).send({ isCompleted: true });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.subtask.isCompleted, true);

      const removed = await client.delete(`${subtasksUrl}/${subtaskId}`);
      assert.equal(removed.status, 200);

      const afterDelete = await client.get(subtasksUrl);
      assert.equal(afterDelete.body.data.subtasks.length, 0);
    });

    test('create responds with the parent task rather than the subtask (known inconsistency)', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const created = await client.post(`${tasksUrl}/${task._id}/subtasks`).send({ title: 'Step' });

      assert.equal(created.status, 201);

      // The payload carries the task's own fields, so it is the task.
      assert.equal(created.body.data.subtask.title, task.title);
      assert.ok(Array.isArray(created.body.data.subtask.subtasks));
      assert.equal(created.body.data.subtask.subtasks.length, 1);
    });

    test('rejects an empty subtask title', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client.post(`${tasksUrl}/${task._id}/subtasks`).send({ title: '' });

      assert.equal(response.status, 400);
    });

    test('returns 404 for an unknown subtask', async () => {
      const { client, tasksUrl, project, owner } = await setup();
      const task = await createTask(project, owner);

      const response = await client
        .patch(`${tasksUrl}/${task._id}/subtasks/000000000000000000000000`)
        .send({ isCompleted: true });

      assert.equal(response.status, 404);
    });
  });

  describe('activity trail', () => {
    test('records task creation in the audit feed', async () => {
      const { client, workspace, project, tasksUrl } = await setup();

      // Created through the API, since the audit entry is written by the
      // service layer rather than the model.
      const created = await client.post(tasksUrl).send({ title: 'Audited task' });
      assert.equal(created.status, 201);

      const response = await client.get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${created.body.data.task._id}/activities`
      );

      assert.equal(response.status, 200);
      assert.ok(response.body.data.activities.length >= 1);
    });
  });
});
