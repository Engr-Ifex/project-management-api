import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  addProjectMember,
  addWorkspaceMember,
  asUser,
  createProject,
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

  return { owner, workspace };
};

describe('Project', () => {
  test('creates a project inside a workspace', async () => {
    const { owner, workspace } = await setup();

    const response = await asUser(app, owner)
      .post(`${API}/workspaces/${workspace._id}/projects`)
      .send({ name: 'New Project', description: 'Desc' });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.project.name, 'New Project');
    assert.equal(response.body.data.project.status, 'planning');
    assert.equal(response.body.data.project.members[0].role, 'owner');
  });

  test('rejects a project with a too-short name', async () => {
    const { owner, workspace } = await setup();

    const response = await asUser(app, owner)
      .post(`${API}/workspaces/${workspace._id}/projects`)
      .send({ name: 'x' });

    assert.equal(response.status, 400);
  });

  test('retrieves a project by id', async () => {
    const { owner, workspace } = await setup();
    const project = await createProject(workspace, owner, { name: 'Existing' });

    const response = await asUser(app, owner).get(
      `${API}/workspaces/${workspace._id}/projects/${project._id}`
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.project.name, 'Existing');
  });

  test('returns 404 for an unknown project', async () => {
    const { owner, workspace } = await setup();

    const response = await asUser(app, owner).get(
      `${API}/workspaces/${workspace._id}/projects/000000000000000000000000`
    );

    assert.equal(response.status, 404);
  });

  test('lists the workspace projects, excluding archived ones by default', async () => {
    const { owner, workspace } = await setup();
    await createProject(workspace, owner, { name: 'Live' });
    const archived = await createProject(workspace, owner, { name: 'Archived' });
    archived.isArchived = true;
    await archived.save();

    const response = await asUser(app, owner).get(`${API}/workspaces/${workspace._id}/projects`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.projects.length, 1);
    assert.equal(response.body.data.projects[0].name, 'Live');
  });

  test('lists archived projects when asked', async () => {
    const { owner, workspace } = await setup();
    await createProject(workspace, owner, { name: 'Live' });
    const archived = await createProject(workspace, owner, { name: 'Archived' });
    archived.isArchived = true;
    await archived.save();

    const response = await asUser(app, owner).get(
      `${API}/workspaces/${workspace._id}/projects?isArchived=true`
    );

    assert.equal(response.body.data.projects.length, 1);
    assert.equal(response.body.data.projects[0].name, 'Archived');
  });

  test('updates a project', async () => {
    const { owner, workspace } = await setup();
    const project = await createProject(workspace, owner);

    const response = await asUser(app, owner)
      .patch(`${API}/workspaces/${workspace._id}/projects/${project._id}`)
      .send({ name: 'Updated', description: 'New' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.project.name, 'Updated');
  });

  test('updates the project status', async () => {
    const { owner, workspace } = await setup();
    const project = await createProject(workspace, owner);

    const response = await asUser(app, owner)
      .patch(`${API}/workspaces/${workspace._id}/projects/${project._id}/status`)
      .send({ status: 'active' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.project.status, 'active');
  });

  test('rejects an invalid project status', async () => {
    const { owner, workspace } = await setup();
    const project = await createProject(workspace, owner);

    const response = await asUser(app, owner)
      .patch(`${API}/workspaces/${workspace._id}/projects/${project._id}/status`)
      .send({ status: 'nonsense' });

    assert.equal(response.status, 400);
  });

  test('archives and restores a project', async () => {
    const { owner, workspace } = await setup();
    const project = await createProject(workspace, owner);
    const client = asUser(app, owner);

    const archived = await client.patch(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/archive`
    );
    assert.equal(archived.status, 200);

    /*
     * An archived project drops out of the active listing. It remains
     * reachable by id, because `getProjectById` does not filter on
     * `isArchived` — unlike tasks, where an archived task is no longer
     * retrievable at all. The inconsistency is noted in the audit summary.
     */
    const listed = await client.get(`${API}/workspaces/${workspace._id}/projects`);

    assert.ok(
      !listed.body.data.projects.some((entry) => String(entry._id) === String(project._id)),
      'an archived project must not appear in the active listing'
    );

    const restored = await client.patch(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/restore`
    );
    assert.equal(restored.status, 200);

    const listedAgain = await client.get(`${API}/workspaces/${workspace._id}/projects`);

    assert.ok(
      listedAgain.body.data.projects.some((entry) => String(entry._id) === String(project._id))
    );
  });

  test('adds a project member', async () => {
    const { owner, workspace } = await setup();
    const project = await createProject(workspace, owner);
    const newMember = await createUser({ name: 'New Member' });
    await addWorkspaceMember(workspace, newMember, 'member');

    const response = await asUser(app, owner)
      .post(`${API}/workspaces/${workspace._id}/projects/${project._id}/members`)
      .send({ userId: String(newMember._id), role: 'member' });

    assert.equal(response.status, 200);
  });

  test('changes a project member role', async () => {
    const { owner, workspace } = await setup();
    const project = await createProject(workspace, owner);
    const member = await createUser({ name: 'Member' });
    await addWorkspaceMember(workspace, member, 'member');
    await addProjectMember(project, member, 'viewer');

    const response = await asUser(app, owner)
      .patch(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/members/${member._id}/role`
      )
      .send({ role: 'admin' });

    assert.equal(response.status, 200);

    const reloaded = await import('../src/models/Project.js').then((m) =>
      m.default.findById(project._id)
    );
    const entry = reloaded.members.find((m) => String(m.user) === String(member._id));

    assert.equal(entry.role, 'admin');
  });

  test('removes a project member', async () => {
    const { owner, workspace } = await setup();
    const project = await createProject(workspace, owner);
    const member = await createUser({ name: 'Member' });
    await addWorkspaceMember(workspace, member, 'member');
    await addProjectMember(project, member, 'member');

    const response = await asUser(app, owner).delete(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/members/${member._id}`
    );

    assert.equal(response.status, 200);
  });

  test('records project creation in the activity feed', async () => {
    const { owner, workspace } = await setup();

    // Created through the API, since the audit entry is written by the
    // service layer rather than the model.
    const created = await asUser(app, owner)
      .post(`${API}/workspaces/${workspace._id}/projects`)
      .send({ name: 'Audited Project' });

    assert.equal(created.status, 201);

    const response = await asUser(app, owner).get(
      `${API}/workspaces/${workspace._id}/projects/${created.body.data.project._id}/activities`
    );

    assert.equal(response.status, 200);
    assert.ok(response.body.data.activities.length >= 1);
  });
});
