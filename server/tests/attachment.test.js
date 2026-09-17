import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import {
  addProjectMember,
  addWorkspaceMember,
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

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

const setup = async () => {
  const owner = await createUser({ name: 'Owner' });
  const workspace = await createWorkspace(owner);
  const project = await createProject(workspace, owner);

  return {
    owner,
    workspace,
    project,
    client: asUser(app, owner),
    attachmentsUrl: `${API}/workspaces/${workspace._id}/projects/${project._id}/attachments`,
  };
};

describe('File uploads', () => {
  test('uploads a PDF to a project', async () => {
    const { client, attachmentsUrl } = await setup();

    const response = await client
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'report.pdf', contentType: 'application/pdf' });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.attachment.originalFilename, 'report.pdf');
    assert.ok(response.body.data.attachment.size > 0);
  });

  test('sanitises a traversal attempt in the filename', async () => {
    const { client, attachmentsUrl } = await setup();

    const response = await client
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: '../../evil.pdf', contentType: 'application/pdf' });

    assert.equal(response.status, 201);

    const stored = response.body.data.attachment.originalFilename;

    assert.ok(!stored.includes('..'), 'traversal must not survive in the stored name');
    assert.ok(!stored.includes('/'), 'path separators must not survive');
  });

  test('generates a stored filename rather than trusting the upload', async () => {
    const { client, attachmentsUrl } = await setup();

    const response = await client
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'report.pdf', contentType: 'application/pdf' });

    const { storedFilename } = response.body.data.attachment;

    assert.notEqual(storedFilename, 'report.pdf');
    assert.match(storedFilename, /^[0-9a-f-]{36}\.pdf$/i, 'a UUID-based name is expected');
  });

  test('rejects an executable', async () => {
    const { client, attachmentsUrl } = await setup();

    const response = await client.post(attachmentsUrl).attach('file', Buffer.from('MZ'), {
      filename: 'payload.exe',
      contentType: 'application/octet-stream',
    });

    assert.equal(response.status, 400);
  });

  test('rejects an executable disguised with an image MIME type', async () => {
    const { client, attachmentsUrl } = await setup();

    const response = await client
      .post(attachmentsUrl)
      .attach('file', Buffer.from('MZ'), { filename: 'payload.exe', contentType: 'image/png' });

    assert.equal(response.status, 400);
  });

  test('rejects a shell script', async () => {
    const { client, attachmentsUrl } = await setup();

    const response = await client
      .post(attachmentsUrl)
      .attach('file', Buffer.from('#!/bin/sh\nrm -rf /'), {
        filename: 'run.sh',
        contentType: 'text/plain',
      });

    assert.equal(response.status, 400);
  });

  test('rejects an HTML file', async () => {
    const { client, attachmentsUrl } = await setup();

    const response = await client
      .post(attachmentsUrl)
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'page.html',
        contentType: 'text/plain',
      });

    assert.equal(response.status, 400);
  });

  test('rejects a file that exceeds the size limit', async () => {
    const { client, attachmentsUrl } = await setup();
    const oversized = Buffer.alloc(11 * 1024 * 1024, 'a');

    const response = await client
      .post(attachmentsUrl)
      .attach('file', oversized, { filename: 'big.pdf', contentType: 'application/pdf' });

    assert.equal(response.status, 400);
  });

  test('lists project attachments', async () => {
    const { client, attachmentsUrl } = await setup();

    await client
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'one.pdf', contentType: 'application/pdf' });

    const response = await client.get(attachmentsUrl);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.attachments.length, 1);
  });

  test('downloads an attachment with safe headers', async () => {
    const { client, workspace, project, attachmentsUrl } = await setup();

    const uploaded = await client
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'report.pdf', contentType: 'application/pdf' });

    const id = uploaded.body.data.attachment._id;

    const response = await client.get(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/attachments/${id}/download`
    );

    assert.equal(response.status, 200);
    assert.match(response.headers['content-disposition'] ?? '', /attachment/i);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  });

  test('deletes an attachment the caller uploaded', async () => {
    const { client, workspace, project, attachmentsUrl } = await setup();

    const uploaded = await client
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'temp.pdf', contentType: 'application/pdf' });

    const response = await client.delete(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/attachments/${uploaded.body.data.attachment._id}`
    );

    assert.equal(response.status, 200);
  });

  test('a member cannot delete another member\u2019s attachment', async () => {
    const { owner, workspace, project, attachmentsUrl } = await setup();
    const member = await createUser({ name: 'Member' });
    await addWorkspaceMember(workspace, member, 'member');
    await addProjectMember(project, member, 'member');

    const uploaded = await asUser(app, owner)
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'owners.pdf', contentType: 'application/pdf' });

    const response = await asUser(app, member).delete(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/attachments/${uploaded.body.data.attachment._id}`
    );

    assert.equal(response.status, 403, 'moderating another user\u2019s upload must be denied');
  });

  test('a project owner may delete another member\u2019s attachment', async () => {
    const { owner, workspace, project, attachmentsUrl } = await setup();
    const member = await createUser({ name: 'Member' });
    await addWorkspaceMember(workspace, member, 'member');
    await addProjectMember(project, member, 'member');

    const uploaded = await asUser(app, member)
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'members.pdf', contentType: 'application/pdf' });

    const response = await asUser(app, owner).delete(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/attachments/${uploaded.body.data.attachment._id}`
    );

    assert.equal(response.status, 200);
  });

  test('a viewer cannot upload', async () => {
    const { workspace, project, attachmentsUrl } = await setup();
    const viewer = await createUser({ name: 'Viewer' });
    await addWorkspaceMember(workspace, viewer, 'member');
    await addProjectMember(project, viewer, 'viewer');

    const response = await asUser(app, viewer)
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'viewer.pdf', contentType: 'application/pdf' });

    assert.equal(response.status, 403);
  });

  test('an outsider cannot upload to another workspace', async () => {
    const { attachmentsUrl } = await setup();
    const outsider = await createUser({ name: 'Outsider' });

    const response = await asUser(app, outsider)
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'outsider.pdf', contentType: 'application/pdf' });

    assert.equal(response.status, 403);
  });

  test('uploads an attachment against a task', async () => {
    const { client, workspace, project, owner } = await setup();
    const task = await createTask(project, owner);

    const response = await client
      .post(
        `${API}/workspaces/${workspace._id}/projects/${project._id}/tasks/${task._id}/attachments`
      )
      .attach('file', PDF, { filename: 'task.pdf', contentType: 'application/pdf' });

    assert.equal(response.status, 201);
  });

  test('requires authentication to upload', async () => {
    const { attachmentsUrl } = await setup();

    const response = await request(app)
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'anon.pdf', contentType: 'application/pdf' });

    assert.equal(response.status, 401);
  });

  test('requires authentication to download', async () => {
    const { client, workspace, project, attachmentsUrl } = await setup();

    const uploaded = await client
      .post(attachmentsUrl)
      .attach('file', PDF, { filename: 'private.pdf', contentType: 'application/pdf' });

    const response = await request(app).get(
      `${API}/workspaces/${workspace._id}/projects/${project._id}/attachments/${uploaded.body.data.attachment._id}/download`
    );

    assert.equal(response.status, 401, 'downloads must never be public');
  });
});
