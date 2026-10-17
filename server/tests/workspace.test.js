import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  addWorkspaceMember,
  asUser,
  createUser,
  createWorkspace,
  uniqueEmail,
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

describe('Workspace', () => {
  test('creates a workspace and makes the creator its owner', async () => {
    const user = await createUser();

    const response = await asUser(app, user)
      .post(`${API}/workspaces`)
      .send({ name: 'My Workspace', description: 'A description' });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.workspace.name, 'My Workspace');
    assert.equal(response.body.data.workspace.members.length, 1);
    assert.equal(response.body.data.workspace.members[0].role, 'owner');
  });

  test('rejects a workspace with a too-short name', async () => {
    const user = await createUser();

    const response = await asUser(app, user).post(`${API}/workspaces`).send({ name: 'x' });

    assert.equal(response.status, 400);
  });

  test('retrieves a workspace by id', async () => {
    const user = await createUser();
    const workspace = await createWorkspace(user);

    const response = await asUser(app, user).get(`${API}/workspaces/${workspace._id}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.workspace.name, workspace.name);
  });

  test('returns 404 for an unknown workspace id', async () => {
    const user = await createUser();

    const response = await asUser(app, user).get(`${API}/workspaces/000000000000000000000000`);

    assert.equal(response.status, 404);
  });

  test('returns 400 for a malformed workspace id', async () => {
    const user = await createUser();

    const response = await asUser(app, user).get(`${API}/workspaces/not-an-object-id`);

    assert.equal(response.status, 400);
  });

  test('lists only the workspaces the caller belongs to', async () => {
    const user = await createUser();
    const stranger = await createUser();

    await createWorkspace(user, { name: 'Mine' });
    await createWorkspace(stranger, { name: 'Theirs' });

    const response = await asUser(app, user).get(`${API}/workspaces`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.workspaces.length, 1);
    assert.equal(response.body.data.workspaces[0].name, 'Mine');
  });

  test('includes workspaces the user was added to', async () => {
    const owner = await createUser();
    const guest = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, guest, 'member');

    const response = await asUser(app, guest).get(`${API}/workspaces`);

    assert.equal(response.body.data.workspaces.length, 1);
  });

  test('updates a workspace', async () => {
    const user = await createUser();
    const workspace = await createWorkspace(user);

    const response = await asUser(app, user)
      .patch(`${API}/workspaces/${workspace._id}`)
      .send({ name: 'Renamed', description: 'New description' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.workspace.name, 'Renamed');
  });

  test('archives and restores a workspace', async () => {
    const user = await createUser();
    const workspace = await createWorkspace(user);

    const archived = await asUser(app, user).patch(`${API}/workspaces/${workspace._id}/archive`);
    assert.equal(archived.status, 200);

    // An archived workspace is invisible to the normal membership guard.
    const hidden = await asUser(app, user).get(`${API}/workspaces/${workspace._id}`);
    assert.equal(hidden.status, 404);

    const restored = await asUser(app, user).patch(`${API}/workspaces/${workspace._id}/restore`);
    assert.equal(restored.status, 200);

    const visible = await asUser(app, user).get(`${API}/workspaces/${workspace._id}`);
    assert.equal(visible.status, 200);
  });

  test('lists workspace members', async () => {
    const owner = await createUser();
    const guest = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, guest, 'member');

    const response = await asUser(app, owner).get(`${API}/workspaces/${workspace._id}/members`);

    assert.equal(response.status, 200);
    const members = response.body.data.members ?? response.body.data.workspace?.members;
    assert.equal(members.length, 2);
  });

  test('a member cannot list members of a workspace they are not in', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const workspace = await createWorkspace(owner);

    const response = await asUser(app, outsider).get(`${API}/workspaces/${workspace._id}/members`);

    assert.equal(response.status, 403);
  });

  /*
   * Workspace member management.
   *
   * The service-level rules in `team.service.js` — who may be removed, who may
   * change a role, and which guards protect the owner — were only ever exercised
   * through DENIAL paths (a member getting a 403 from the permission
   * middleware), so the functions themselves were never reached. These tests
   * drive the successful paths and the guards the middleware cannot express.
   */
  test('the owner removes a member', async () => {
    const owner = await createUser();
    const guest = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, guest, 'member');

    const response = await asUser(app, owner).delete(
      `${API}/workspaces/${workspace._id}/members/${guest._id}`
    );

    assert.equal(response.status, 200);

    const reloaded = await import('../src/models/Workspace.js').then((m) =>
      m.default.findById(workspace._id)
    );

    assert.ok(
      !reloaded.members.some((member) => String(member.user) === String(guest._id)),
      'the removed member must be gone from the workspace'
    );
  });

  test('an admin removes a regular member', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const guest = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, admin, 'admin');
    await addWorkspaceMember(workspace, guest, 'member');

    const response = await asUser(app, admin).delete(
      `${API}/workspaces/${workspace._id}/members/${guest._id}`
    );

    assert.equal(response.status, 200);
  });

  test('an admin cannot remove another admin', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const peer = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, admin, 'admin');
    await addWorkspaceMember(workspace, peer, 'admin');

    const response = await asUser(app, admin).delete(
      `${API}/workspaces/${workspace._id}/members/${peer._id}`
    );

    assert.equal(response.status, 403);
  });

  test('the workspace owner cannot be removed', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, admin, 'admin');

    const response = await asUser(app, admin).delete(
      `${API}/workspaces/${workspace._id}/members/${owner._id}`
    );

    assert.equal(response.status, 403);
  });

  test('an admin cannot remove themselves', async () => {
    /*
     * The requester must hold REMOVE_MEMBERS to reach the service at all, so
     * the self-removal guard is exercised with an admin. (A plain member is
     * stopped earlier by the permission middleware with a 403.)
     */
    const owner = await createUser();
    const admin = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, admin, 'admin');

    const response = await asUser(app, admin).delete(
      `${API}/workspaces/${workspace._id}/members/${admin._id}`
    );

    assert.equal(response.status, 400);
  });

  test('the owner changes a member role', async () => {
    const owner = await createUser();
    const guest = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, guest, 'member');

    const response = await asUser(app, owner)
      .patch(`${API}/workspaces/${workspace._id}/members/${guest._id}/role`)
      .send({ role: 'admin' });

    assert.equal(response.status, 200);

    const reloaded = await import('../src/models/Workspace.js').then((m) =>
      m.default.findById(workspace._id)
    );

    const updated = reloaded.members.find((member) => String(member.user) === String(guest._id));

    assert.equal(updated.role, 'admin', 'the new role must be persisted');
  });

  test('an admin cannot change a role', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const guest = await createUser();
    const workspace = await createWorkspace(owner);
    await addWorkspaceMember(workspace, admin, 'admin');
    await addWorkspaceMember(workspace, guest, 'member');

    const response = await asUser(app, admin)
      .patch(`${API}/workspaces/${workspace._id}/members/${guest._id}/role`)
      .send({ role: 'admin' });

    assert.equal(response.status, 403, 'only the owner may change roles');
  });

  test('the owner role cannot be changed', async () => {
    const owner = await createUser();
    const workspace = await createWorkspace(owner);

    const response = await asUser(app, owner)
      .patch(`${API}/workspaces/${workspace._id}/members/${owner._id}/role`)
      .send({ role: 'member' });

    assert.equal(response.status, 403);
  });

  test('the owner can delete the workspace', async () => {
    const user = await createUser();
    const workspace = await createWorkspace(user);

    const response = await asUser(app, user).delete(`${API}/workspaces/${workspace._id}`);

    assert.equal(response.status, 200);
  });

  test('invites a member by email and accepts the invitation', async () => {
    const owner = await createUser();
    const workspace = await createWorkspace(owner);
    const inviteeEmail = uniqueEmail('invitee');

    const invited = await asUser(app, owner)
      .post(`${API}/workspaces/${workspace._id}/invitations`)
      .send({ email: inviteeEmail, role: 'member' });

    assert.equal(invited.status, 201);

    const { default: Invitation } = await import('../src/models/Invitation.js');
    const invitation = await Invitation.findOne({ email: inviteeEmail });

    assert.ok(invitation, 'an invitation record should exist');

    const invitee = await createUser({ email: inviteeEmail });
    const accepted = await asUser(app, invitee).patch(
      `${API}/invitations/${invitation.token}/accept`
    );

    assert.equal(accepted.status, 200);

    const reloaded = await import('../src/models/Workspace.js').then((m) =>
      m.default.findById(workspace._id)
    );
    assert.ok(reloaded.members.some((member) => String(member.user) === String(invitee._id)));
  });

  test('rejects an expired invitation with 410 and marks it expired', async () => {
    const owner = await createUser();
    const workspace = await createWorkspace(owner);
    const inviteeEmail = uniqueEmail('expired-invitee');
    const token = 'e'.repeat(64);

    /*
     * Created through the model with a past `expiresAt`: the API always mints a
     * 48-hour window, so an expired invitation cannot be produced through it.
     */
    const { default: Invitation } = await import('../src/models/Invitation.js');

    await Invitation.create({
      workspace: workspace._id,
      invitedBy: owner._id,
      email: inviteeEmail,
      role: 'member',
      token,
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const invitee = await createUser({ email: inviteeEmail });

    const response = await asUser(app, invitee).patch(`${API}/invitations/${token}/accept`);

    assert.equal(response.status, 410);

    const stored = await Invitation.findOne({ token });

    assert.equal(stored.status, 'expired', 'the invitation must be marked expired');
    assert.equal(stored.acceptedAt, null, 'an expired invitation is never accepted');

    const reloaded = await import('../src/models/Workspace.js').then((m) =>
      m.default.findById(workspace._id)
    );

    assert.ok(
      !reloaded.members.some((member) => String(member.user) === String(invitee._id)),
      'an expired invitation must not grant membership'
    );
  });

  test('an expired invitation does not block a fresh one', async () => {
    const owner = await createUser();
    const workspace = await createWorkspace(owner);
    const inviteeEmail = uniqueEmail('reinvite');

    const { default: Invitation } = await import('../src/models/Invitation.js');

    await Invitation.create({
      workspace: workspace._id,
      invitedBy: owner._id,
      email: inviteeEmail,
      role: 'member',
      token: 'f'.repeat(64),
      status: 'expired',
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    /*
     * The partial unique index on {workspace, email} covers `status: 'pending'`
     * only, so an expired row must not make this a 409 — otherwise a re-invite
     * would be permanently blocked after the first invitation lapsed.
     */
    const response = await asUser(app, owner)
      .post(`${API}/workspaces/${workspace._id}/invitations`)
      .send({ email: inviteeEmail, role: 'member' });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.invitation.status, 'pending');
  });
});
