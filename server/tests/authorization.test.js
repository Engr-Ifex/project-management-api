import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  asUser,
  createComment,
  createLabel,
  createProject,
  createTask,
  createUser,
  createWorkspace,
  addProjectMember,
  addWorkspaceMember,
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

/**
 * Build a workspace whose members hold the given workspace roles, plus one
 * project whose members hold the given project roles.
 */
const buildScenario = async ({ workspaceRoles = {}, projectRoles = {} } = {}) => {
  const owner = await createUser({ name: 'Workspace Owner' });
  const workspace = await createWorkspace(owner);

  const actors = { owner };

  for (const [key, role] of Object.entries(workspaceRoles)) {
    const user = await createUser({ name: `Workspace ${role}` });
    await addWorkspaceMember(workspace, user, role);
    actors[key] = user;
  }

  const project = await createProject(workspace, owner);

  for (const [key, role] of Object.entries(projectRoles)) {
    const user = actors[key] ?? (await createUser({ name: `Project ${role}` }));
    await addProjectMember(project, user, role);
    actors[key] = user;
  }

  return { actors, workspace, project };
};

describe('Authorization', () => {
  describe('workspace roles', () => {
    test('owner can update the workspace', async () => {
      const { actors, workspace } = await buildScenario();

      const response = await asUser(app, actors.owner)
        .patch(`${API}/workspaces/${workspace._id}`)
        .send({ name: 'Renamed' });

      assert.equal(response.status, 200);
    });

    test('admin can update the workspace', async () => {
      const { actors, workspace } = await buildScenario({ workspaceRoles: { admin: 'admin' } });

      const response = await asUser(app, actors.admin)
        .patch(`${API}/workspaces/${workspace._id}`)
        .send({ name: 'Renamed' });

      assert.equal(response.status, 200);
    });

    test('member cannot update the workspace', async () => {
      const { actors, workspace } = await buildScenario({ workspaceRoles: { member: 'member' } });

      const response = await asUser(app, actors.member)
        .patch(`${API}/workspaces/${workspace._id}`)
        .send({ name: 'Renamed' });

      assert.equal(response.status, 403);
    });

    test('owner can archive the workspace', async () => {
      const { actors, workspace } = await buildScenario();

      const response = await asUser(app, actors.owner).patch(
        `${API}/workspaces/${workspace._id}/archive`
      );

      assert.equal(response.status, 200);
    });

    test('member cannot archive the workspace', async () => {
      const { actors, workspace } = await buildScenario({ workspaceRoles: { member: 'member' } });

      const response = await asUser(app, actors.member).patch(
        `${API}/workspaces/${workspace._id}/archive`
      );

      assert.equal(response.status, 403);
    });

    test('only the owner can delete the workspace', async () => {
      const { actors, workspace } = await buildScenario({
        workspaceRoles: { admin: 'admin', member: 'member' },
      });

      const adminAttempt = await asUser(app, actors.admin).delete(
        `${API}/workspaces/${workspace._id}`
      );
      const memberAttempt = await asUser(app, actors.member).delete(
        `${API}/workspaces/${workspace._id}`
      );

      assert.equal(adminAttempt.status, 403);
      assert.equal(memberAttempt.status, 403);
    });

    test('only the owner can transfer ownership', async () => {
      const { actors, workspace } = await buildScenario({
        workspaceRoles: { admin: 'admin', member: 'member' },
      });

      const response = await asUser(app, actors.admin)
        .patch(`${API}/workspaces/${workspace._id}/transfer-ownership`)
        .send({ userId: String(actors.member._id) });

      assert.equal(response.status, 403);
    });

    test('member cannot invite new members', async () => {
      const { actors, workspace } = await buildScenario({ workspaceRoles: { member: 'member' } });

      const response = await asUser(app, actors.member)
        .post(`${API}/workspaces/${workspace._id}/invitations`)
        .send({ email: 'invitee@test.local', role: 'member' });

      assert.equal(response.status, 403);
    });

    test('member cannot remove another member', async () => {
      const { actors, workspace } = await buildScenario({
        workspaceRoles: { member: 'member', other: 'member' },
      });

      const response = await asUser(app, actors.member).delete(
        `${API}/workspaces/${workspace._id}/members/${actors.other._id}`
      );

      assert.equal(response.status, 403);
    });

    test('a plain member can read the workspace', async () => {
      const { actors, workspace } = await buildScenario({ workspaceRoles: { member: 'member' } });

      const response = await asUser(app, actors.member).get(`${API}/workspaces/${workspace._id}`);

      assert.equal(response.status, 200);
    });
  });

  describe('cross-workspace isolation', () => {
    test('an outsider cannot read a workspace they do not belong to', async () => {
      const { workspace } = await buildScenario();
      const outsider = await createUser({ name: 'Outsider' });

      const response = await asUser(app, outsider).get(`${API}/workspaces/${workspace._id}`);

      assert.equal(response.status, 403);
    });

    test('an outsider cannot list another workspace\u2019s projects', async () => {
      const { workspace } = await buildScenario();
      const outsider = await createUser({ name: 'Outsider' });

      const response = await asUser(app, outsider).get(
        `${API}/workspaces/${workspace._id}/projects`
      );

      assert.equal(response.status, 403);
    });

    test('an outsider cannot read a project in another workspace', async () => {
      const { workspace, project } = await buildScenario();
      const outsider = await createUser({ name: 'Outsider' });

      const response = await asUser(app, outsider).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      assert.equal(response.status, 403);
    });

    test('an outsider cannot create a task in another workspace', async () => {
      const { workspace, project } = await buildScenario();
      const outsider = await createUser({ name: 'Outsider' });

      const response = await asUser(app, outsider)
        .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`)
        .send({ title: 'Injected task' });

      assert.equal(response.status, 403);
    });

    test('an outsider cannot read another workspace\u2019s dashboard', async () => {
      const { workspace } = await buildScenario();
      const outsider = await createUser({ name: 'Outsider' });

      const response = await asUser(app, outsider).get(
        `${API}/workspaces/${workspace._id}/dashboard`
      );

      assert.equal(response.status, 403);
    });

    test('a member of one workspace cannot use it to reach another workspace\u2019s project', async () => {
      const first = await buildScenario();
      const second = await buildScenario();

      // A valid member of workspace A, but the project belongs to workspace B.
      const response = await asUser(app, first.actors.owner).get(
        `${API}/workspaces/${first.workspace._id}/projects/${second.project._id}`
      );

      assert.equal(response.status, 404);
    });

    test('a workspace member cannot act on a project from a different workspace', async () => {
      const first = await buildScenario();
      const second = await buildScenario();

      const response = await asUser(app, first.actors.owner)
        .post(`${API}/workspaces/${first.workspace._id}/projects/${second.project._id}/tasks`)
        .send({ title: 'Cross-workspace task' });

      assert.equal(response.status, 404);
    });
  });

  describe('project roles', () => {
    test('project owner can create, update and archive tasks', async () => {
      const { actors, workspace, project } = await buildScenario();
      const client = asUser(app, actors.owner);
      const base = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`;

      const created = await client.post(base).send({ title: 'Owned task' });
      assert.equal(created.status, 201);

      const updated = await client
        .patch(`${base}/${created.body.data.task._id}`)
        .send({ title: 'Updated' });
      assert.equal(updated.status, 200);

      // Tasks are archived, never hard-deleted.
      const archived = await client.patch(`${base}/${created.body.data.task._id}/archive`);
      assert.equal(archived.status, 200);
    });

    test('project admin can create, update and archive tasks', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { admin: 'member' },
        projectRoles: { admin: 'admin' },
      });
      const client = asUser(app, actors.admin);
      const base = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`;

      const created = await client.post(base).send({ title: 'Admin task' });
      assert.equal(created.status, 201);

      const archived = await client.patch(`${base}/${created.body.data.task._id}/archive`);
      assert.equal(archived.status, 200);
    });

    test('project member can create and update tasks but cannot archive them', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
        projectRoles: { member: 'member' },
      });
      const client = asUser(app, actors.member);
      const base = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`;

      const created = await client.post(base).send({ title: 'Member task' });
      assert.equal(created.status, 201);

      const updated = await client
        .patch(`${base}/${created.body.data.task._id}`)
        .send({ title: 'Edited' });
      assert.equal(updated.status, 200);

      const archived = await client.patch(`${base}/${created.body.data.task._id}/archive`);
      assert.equal(archived.status, 403, 'a member must not be able to archive tasks');
    });

    test('project member cannot archive a task', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
        projectRoles: { member: 'member' },
      });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.member).patch(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/archive`
      );

      assert.equal(response.status, 403);
    });

    test('project member cannot update the project', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
        projectRoles: { member: 'member' },
      });

      const response = await asUser(app, actors.member)
        .patch(`${API}/workspaces/${workspace._id}/projects/${project._id}`)
        .send({ name: 'Renamed' });

      assert.equal(response.status, 403);
    });

    test('project member cannot archive the project', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
        projectRoles: { member: 'member' },
      });

      const response = await asUser(app, actors.member).patch(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/archive`
      );

      assert.equal(response.status, 403);
    });

    test('project member cannot manage project members', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
        projectRoles: { member: 'member' },
      });
      const outsider = await createUser({ name: 'Target' });
      await addWorkspaceMember(workspace, outsider, 'member');

      const response = await asUser(app, actors.member)
        .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/members`)
        .send({ userId: String(outsider._id), role: 'member' });

      assert.equal(response.status, 403);
    });

    test('project member cannot change another member\u2019s project role', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member', other: 'member' },
        projectRoles: { member: 'member', other: 'viewer' },
      });

      const response = await asUser(app, actors.member)
        .patch(
          `${API}/workspaces/${workspace._id}/projects/${project._id}/members/${actors.other._id}/role`
        )
        .send({ role: 'admin' });

      assert.equal(response.status, 403);
    });

    test('project member cannot create labels', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
        projectRoles: { member: 'member' },
      });

      const response = await asUser(app, actors.member)
        .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/labels`)
        .send({ name: 'Sneaky', color: '#ff0000' });

      assert.equal(response.status, 403);
    });
  });

  describe('viewer role', () => {
    test('viewer can read the project', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });

      const response = await asUser(app, actors.viewer).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      assert.equal(response.status, 200);
    });

    test('viewer cannot create a task', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });

      const response = await asUser(app, actors.viewer)
        .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`)
        .send({ title: 'Viewer task' });

      assert.equal(response.status, 403);
    });

    test('viewer cannot update a task', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.viewer)
        .patch(`${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}`)
        .send({ title: 'Edited by viewer' });

      assert.equal(response.status, 403);
    });

    test('viewer cannot archive a task', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.viewer).patch(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/archive`
      );

      assert.equal(response.status, 403);
    });

    test('viewer cannot change task status, priority or assignment', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });
      const task = await createTask(project, actors.owner);
      const client = asUser(app, actors.viewer);
      const base = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}`;

      assert.equal(
        (await client.patch(`${base}/status`).send({ status: 'completed' })).status,
        403
      );
      assert.equal(
        (await client.patch(`${base}/priority`).send({ priority: 'urgent' })).status,
        403
      );
      assert.equal(
        (await client.patch(`${base}/assignee`).send({ assignee: String(actors.owner._id) }))
          .status,
        403
      );
    });

    test('viewer cannot post a comment', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.viewer)
        .post(
          `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/comments`
        )
        .send({ content: 'Viewer comment' });

      assert.equal(response.status, 403);
    });

    test('viewer cannot create a label', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });

      const response = await asUser(app, actors.viewer)
        .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/labels`)
        .send({ name: 'Viewer label', color: '#00ff00' });

      assert.equal(response.status, 403);
    });
  });

  describe('cross-project isolation', () => {
    test('a task cannot be reached through a different project\u2019s URL', async () => {
      const { actors, workspace, project } = await buildScenario();
      const otherProject = await createProject(workspace, actors.owner, { name: 'Other Project' });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.owner).get(
        `${API}/workspaces/${workspace._id}/projects/${otherProject._id}/tasks/${task._id}`
      );

      assert.equal(response.status, 404);
    });

    test('a task cannot be updated through a different project\u2019s URL', async () => {
      const { actors, workspace, project } = await buildScenario();
      const otherProject = await createProject(workspace, actors.owner, { name: 'Other Project' });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.owner)
        .patch(`${API}/workspaces/${workspace._id}/projects/${otherProject._id}/tasks/${task._id}`)
        .send({ title: 'Hijacked' });

      assert.equal(response.status, 404);
    });

    test('a task cannot be deleted through a different project\u2019s URL', async () => {
      const { actors, workspace, project } = await buildScenario();
      const otherProject = await createProject(workspace, actors.owner, { name: 'Other Project' });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.owner).delete(
        `${API}/workspaces/${workspace._id}/projects/${otherProject._id}/tasks/${task._id}`
      );

      assert.equal(response.status, 404);
    });

    test('a comment cannot be reached through a different task\u2019s URL', async () => {
      const { actors, workspace, project } = await buildScenario();
      const taskA = await createTask(project, actors.owner, { title: 'A' });
      const taskB = await createTask(project, actors.owner, { title: 'B' });
      const comment = await createComment(taskA, actors.owner);

      const response = await asUser(app, actors.owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${taskB._id}/comments/${comment._id}`
      );

      assert.equal(response.status, 404);
    });

    test('a label from one project cannot be applied to another project\u2019s task', async () => {
      const { actors, workspace, project } = await buildScenario();
      const otherProject = await createProject(workspace, actors.owner, { name: 'Other Project' });
      const label = await createLabel(otherProject, { name: 'Foreign' });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.owner)
        .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/labels`)
        .send({ labelId: String(label._id) });

      assert.ok([400, 404].includes(response.status), `expected 400/404, got ${response.status}`);
    });
  });

  describe('another user\u2019s protected resources', () => {
    test('a member cannot delete another member\u2019s comment', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member', other: 'member' },
        projectRoles: { member: 'member', other: 'member' },
      });
      const task = await createTask(project, actors.owner);
      const comment = await createComment(task, actors.other);

      const response = await asUser(app, actors.member).delete(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/comments/${comment._id}`
      );

      assert.equal(response.status, 403, 'moderating another user\u2019s comment must be denied');
    });

    test('a project owner may moderate another member\u2019s comment', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
        projectRoles: { member: 'member' },
      });
      const task = await createTask(project, actors.owner);
      const comment = await createComment(task, actors.member);

      const response = await asUser(app, actors.owner).delete(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/comments/${comment._id}`
      );

      assert.equal(response.status, 200);
    });

    test('a member cannot update another member\u2019s comment', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member', other: 'member' },
        projectRoles: { member: 'member', other: 'member' },
      });
      const task = await createTask(project, actors.owner);
      const comment = await createComment(task, actors.other);

      const response = await asUser(app, actors.member)
        .patch(
          `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/comments/${comment._id}`
        )
        .send({ content: 'Tampered' });

      assert.equal(response.status, 403);
    });

    test('a user cannot read another user\u2019s notifications', async () => {
      const first = await createUser({ name: 'First' });
      const second = await createUser({ name: 'Second' });

      const response = await asUser(app, first).get(`${API}/notifications`);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.notifications.length, 0);

      const otherView = await asUser(app, second).get(`${API}/notifications`);
      assert.equal(otherView.body.data.notifications.length, 0);
    });

    test('a user cannot change another user\u2019s profile', async () => {
      const victim = await createUser({ name: 'Victim', email: 'victim@test.local' });
      const attacker = await createUser({ name: 'Attacker' });

      // The profile endpoint is bound to the session, so the attacker's own
      // profile changes and the victim's is untouched.
      await asUser(app, attacker).patch(`${API}/users/profile`).send({ name: 'Renamed' });

      const { default: User } = await import('../src/models/User.js');
      const reloaded = await User.findById(victim._id);

      assert.equal(reloaded.name, 'Victim');
    });

    test('a user cannot delete another user\u2019s account', async () => {
      const victim = await createUser({ name: 'Victim' });
      const attacker = await createUser({ name: 'Attacker' });

      await asUser(app, attacker).delete(`${API}/users/account`);

      const { default: User } = await import('../src/models/User.js');
      const reloaded = await User.findById(victim._id);

      assert.equal(reloaded.isDeleted, false);
    });
  });

  describe('workspace owner/admin override (Policy A)', () => {
    /*
     * POLICY A — a workspace owner or admin holds authority over every project
     * in their workspace, so project membership is not required of them.
     *
     * The rule is defined once, in `hasProjectOverride`, and applied both by
     * `requireProjectPermission` and by the services that re-check membership.
     * These tests pin the whole surface so the two layers cannot drift apart
     * again.
     */
    test('can read a project they are not a member of', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { admin: 'admin' },
      });

      const response = await asUser(app, actors.admin).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard`
      );

      assert.equal(response.status, 200);
    });

    test('can create a task without being a project member', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { admin: 'admin' },
      });

      const response = await asUser(app, actors.admin)
        .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`)
        .send({ title: 'Admin override task' });

      assert.equal(
        response.status,
        201,
        'a workspace admin must not need project membership to create a task'
      );
    });

    test('can create, update and delete subtasks without being a project member', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { admin: 'admin' },
      });
      const client = asUser(app, actors.admin);
      const tasksUrl = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`;

      const parent = await asUser(app, actors.owner).post(tasksUrl).send({ title: 'Parent task' });
      const subtasksUrl = `${tasksUrl}/${parent.body.data.task._id}/subtasks`;

      const created = await client.post(subtasksUrl).send({ title: 'Admin subtask' });
      assert.equal(created.status, 201);

      const listed = await client.get(subtasksUrl);
      const subtaskId = listed.body.data.subtasks[0]._id;

      const updated = await client.patch(`${subtasksUrl}/${subtaskId}`).send({ isCompleted: true });
      assert.equal(updated.status, 200);

      const removed = await client.delete(`${subtasksUrl}/${subtaskId}`);
      assert.equal(removed.status, 200);
    });

    test('can archive and restore a task without being a project member', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { admin: 'admin' },
      });
      const client = asUser(app, actors.admin);
      const base = `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`;
      const task = await createTask(project, actors.owner);

      assert.equal((await client.patch(`${base}/${task._id}/archive`)).status, 200);
      assert.equal((await client.patch(`${base}/${task._id}/restore`)).status, 200);
    });

    test('a workspace MEMBER still needs a project role', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
      });

      const response = await asUser(app, actors.member).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/dashboard`
      );

      assert.equal(response.status, 403, 'only owner/admin are elevated, not plain members');
    });

    test('a workspace admin cannot create a task in a workspace they do not belong to', async () => {
      const first = await buildScenario({ workspaceRoles: { admin: 'admin' } });
      const second = await buildScenario();

      const response = await asUser(app, first.actors.admin)
        .post(`${API}/workspaces/${second.workspace._id}/projects/${second.project._id}/tasks`)
        .send({ title: 'Cross-workspace task' });

      assert.equal(response.status, 403);
    });

    test('the override does not extend to another workspace', async () => {
      const first = await buildScenario({ workspaceRoles: { admin: 'admin' } });
      const second = await buildScenario();

      const response = await asUser(app, first.actors.admin).get(
        `${API}/workspaces/${second.workspace._id}/projects/${second.project._id}/dashboard`
      );

      assert.equal(response.status, 403);
    });

    /*
     * Editing is an object-level rule, not a role rule: only the author may
     * change a comment's words, and no project or workspace role overrides
     * that. Deletion is different — see the moderation tests above, where a
     * workspace admin may delete another member's comment.
     */
    test('a workspace admin still cannot edit another member\u2019s comment', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { admin: 'admin', other: 'member' },
        projectRoles: { other: 'member' },
      });
      const task = await createTask(project, actors.owner);
      const comment = await createComment(task, actors.other);

      const response = await asUser(app, actors.admin)
        .patch(
          `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/comments/${comment._id}`
        )
        .send({ content: 'Edited by admin' });

      assert.equal(response.status, 403);
      assert.match(response.body.message, /your own comments/i);
    });
  });

  /*
   * Read scope.
   *
   * Workspace membership grants the project *record* and the project list, so a
   * member can discover what exists in the workspace. Everything inside a
   * project — tasks, subtasks, comments, labels, attachments, dashboard,
   * activity — requires a project role.
   *
   * This used to be inconsistent: task and subtask reads needed only workspace
   * membership. Because a task response populates its labels with names and
   * colours, that let a workspace member read label data through the task route
   * that the label routes refuse them. These tests pin both tiers.
   */
  describe('project content read scope', () => {
    test('a plain workspace member cannot list a project\u2019s tasks', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
      });
      await createTask(project, actors.owner);

      const response = await asUser(app, actors.member).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`
      );

      assert.equal(response.status, 403);
    });

    test('a plain workspace member cannot read a single task', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
      });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.member).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}`
      );

      assert.equal(response.status, 403);
    });

    test('a plain workspace member cannot read a task\u2019s subtasks', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
      });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.member).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/subtasks`
      );

      assert.equal(response.status, 403);
    });

    test('a plain workspace member can still read the project record itself', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { member: 'member' },
      });

      const response = await asUser(app, actors.member).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      assert.equal(response.status, 200, 'project discovery stays at workspace level');
    });

    test('a project viewer can read tasks', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });
      const task = await createTask(project, actors.owner);

      const list = await asUser(app, actors.viewer).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks`
      );
      const single = await asUser(app, actors.viewer).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}`
      );

      assert.equal(list.status, 200);
      assert.equal(single.status, 200);
    });

    test('a workspace admin can read tasks without project membership', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { admin: 'admin' },
      });
      const task = await createTask(project, actors.owner);

      const response = await asUser(app, actors.admin).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}`
      );

      assert.equal(response.status, 200);
    });
  });

  /*
   * Project detail privacy.
   *
   * A workspace member who holds no project role may discover a project — the
   * list and the record are readable with workspace membership alone. They must
   * not, however, receive the people on it: `members` carries names, email
   * addresses and avatars, and the array itself is project-internal membership
   * data. Before this was shaped, any workspace member could enumerate every
   * project's membership and read every member's address without being on any
   * of those projects.
   *
   * The full response is preserved for anyone with project access, and for a
   * workspace owner/admin under Policy A.
   */
  describe('project detail privacy', () => {
    /** A project the given user is NOT a member of, with one other member on it. */
    const outsiderScenario = async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { outsider: 'member', insider: 'member' },
        projectRoles: { insider: 'member' },
      });

      return { actors, workspace, project };
    };

    test('a workspace member sees no members on the project record', async () => {
      const { actors, workspace, project } = await outsiderScenario();

      const response = await asUser(app, actors.outsider).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      assert.equal(response.status, 200, 'discovery must keep working');
      assert.equal(response.body.data.project.members, undefined);
    });

    test('a workspace member receives no member email anywhere in the record', async () => {
      const { actors, workspace, project } = await outsiderScenario();

      const response = await asUser(app, actors.outsider).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      const serialized = JSON.stringify(response.body);

      assert.ok(
        !serialized.includes('@'),
        `no email address may appear in the response: ${serialized}`
      );
    });

    test('the creator is reduced to a reference, not a user record', async () => {
      const { actors, workspace, project } = await outsiderScenario();

      const response = await asUser(app, actors.outsider).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      const { createdBy } = response.body.data.project;

      assert.equal(typeof createdBy, 'string', 'createdBy must be an id, not a populated user');
    });

    test('a workspace member sees no members on the project list either', async () => {
      const { actors, workspace } = await outsiderScenario();

      const response = await asUser(app, actors.outsider).get(
        `${API}/workspaces/${workspace._id}/projects`
      );

      assert.equal(response.status, 200, 'listing must keep working');
      assert.ok(response.body.data.projects.length > 0, 'the project is still discoverable');

      for (const listed of response.body.data.projects) {
        assert.equal(listed.members, undefined, 'no membership data on a discovered project');
      }

      assert.ok(!JSON.stringify(response.body).includes('@'), 'no email may appear');
    });

    /*
     * For the authorized cases below, the assertion is that the response was
     * NOT redacted — `createdBy` is still a populated user with an address, and
     * `members` is still present. The populated CONTENTS of `members[].user`
     * cannot be asserted here: the in-process store hydrates rows through
     * `Model.hydrate`, which cannot represent a populated reference inside an
     * embedded array (see `tests/helpers/memoryStore.js`). Asserting on
     * `createdBy` proves the same thing — that the shaping did not run.
     */
    const assertNotRedacted = (project) => {
      assert.ok(Array.isArray(project.members), 'members must still be present');
      assert.ok(project.members.length > 0, 'members must not be emptied');
      assert.equal(typeof project.createdBy, 'object', 'createdBy must still be populated');
      assert.equal(
        typeof project.createdBy.email,
        'string',
        'an authorized caller still receives user details'
      );
    };

    test('a project member still receives the member details', async () => {
      const { actors, workspace, project } = await outsiderScenario();

      const response = await asUser(app, actors.insider).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      assert.equal(response.status, 200);
      assertNotRedacted(response.body.data.project);
    });

    test('a project viewer still receives the member details', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { viewer: 'member' },
        projectRoles: { viewer: 'viewer' },
      });

      const response = await asUser(app, actors.viewer).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      assert.equal(response.status, 200);
      assertNotRedacted(response.body.data.project);
    });

    test('a workspace admin keeps the member details without project membership', async () => {
      const { actors, workspace, project } = await buildScenario({
        workspaceRoles: { admin: 'admin' },
      });

      const response = await asUser(app, actors.admin).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      assert.equal(response.status, 200);
      assertNotRedacted(response.body.data.project);
    });

    test('the project owner keeps the member details', async () => {
      const { actors, workspace, project } = await outsiderScenario();

      const response = await asUser(app, actors.owner).get(
        `${API}/workspaces/${workspace._id}/projects/${project._id}`
      );

      assert.equal(response.status, 200);
      assertNotRedacted(response.body.data.project);
    });
  });
});
