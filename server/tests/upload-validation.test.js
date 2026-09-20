import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import { asUser, createProject, createUser, createWorkspace } from './helpers/factories.js';

import { PUBLIC_AVATARS_DIR } from '../src/config/paths.js';
import { MIME_TYPE_EXTENSIONS } from '../src/constants/attachment.js';
import { MIME_TYPES_WITH_CONTENT_RULES } from '../src/utils/fileSignature.js';

/*
 * Upload content validation.
 *
 * The MIME type and the extension in an upload are both chosen by the client,
 * so a renamed file satisfies them. These tests are about the bytes: a file
 * whose content is not what it claims must be rejected, and a rejected upload
 * must leave nothing behind.
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

/* ---- fixtures with genuine signatures ---------------------------- */

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR-and-a-payload'),
]);

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('jfif-and-a-payload'),
]);

const GIF = Buffer.from('GIF89a-and-a-payload');

const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.from('vp8-and-a-payload'),
]);

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');

const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('zip payload')]);

/* OLE2 compound file — the legacy Word/Excel/PowerPoint container. */
const OLE2 = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.from('ole2 payload'),
]);

const TEXT = Buffer.from('name,email\nAda,ada@example.com\n');

/* ---- fixtures that must be rejected ------------------------------ */

/*
 * A Windows PE executable: `MZ` plus a NUL byte, which no text format contains
 * and no image signature matches.
 */
const EXECUTABLE = Buffer.concat([
  Buffer.from('MZ'),
  Buffer.from([0x90, 0x00, 0x03, 0x00]),
  Buffer.from('fake-executable-payload'),
]);

const OOXML_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

const upload = (client, url, buffer, filename, contentType) =>
  client.post(url).attach('file', buffer, { filename, contentType });

const attachmentCount = async () => {
  const { default: Attachment } = await import('../src/models/Attachment.js');

  return Attachment.countDocuments({});
};

const avatarFiles = () =>
  fs.existsSync(PUBLIC_AVATARS_DIR) ? fs.readdirSync(PUBLIC_AVATARS_DIR) : [];

describe('upload content validation', () => {
  describe('a valid file is accepted', () => {
    const valid = [
      ['PNG', PNG, 'photo.png', 'image/png'],
      ['JPEG', JPEG, 'photo.jpg', 'image/jpeg'],
      ['GIF', GIF, 'animation.gif', 'image/gif'],
      ['WEBP', WEBP, 'photo.webp', 'image/webp'],
      ['PDF', PDF, 'report.pdf', 'application/pdf'],
      ['ZIP', ZIP, 'archive.zip', 'application/zip'],
      ['DOCX (a ZIP container)', ZIP, 'document.docx', OOXML_DOCX],
      ['DOC (an OLE2 container)', OLE2, 'document.doc', 'application/msword'],
      ['plain text', TEXT, 'notes.txt', 'text/plain'],
      ['CSV', TEXT, 'rows.csv', 'text/csv'],
    ];

    for (const [label, buffer, filename, contentType] of valid) {
      test(`${label}: extension, MIME type and content all agree`, async () => {
        const { client, attachmentsUrl } = await setup();

        const response = await upload(client, attachmentsUrl, buffer, filename, contentType);

        assert.equal(response.status, 201, response.body.message);
      });
    }
  });

  describe('content that does not match is rejected', () => {
    test('an executable renamed to .png is rejected', async () => {
      const { client, attachmentsUrl } = await setup();

      const response = await upload(client, attachmentsUrl, EXECUTABLE, 'payload.png', 'image/png');

      assert.equal(response.status, 400);
    });

    test('an executable renamed to .pdf is rejected', async () => {
      const { client, attachmentsUrl } = await setup();

      const response = await upload(
        client,
        attachmentsUrl,
        EXECUTABLE,
        'payload.pdf',
        'application/pdf'
      );

      assert.equal(response.status, 400);
    });

    test('PNG bytes sent as a PDF are rejected', async () => {
      const { client, attachmentsUrl } = await setup();

      const response = await upload(client, attachmentsUrl, PNG, 'image.pdf', 'application/pdf');

      assert.equal(response.status, 400);
    });

    test('a PDF sent as a PNG is rejected', async () => {
      const { client, attachmentsUrl } = await setup();

      const response = await upload(client, attachmentsUrl, PDF, 'document.png', 'image/png');

      assert.equal(response.status, 400);
    });

    test('a text file sent as an image is rejected', async () => {
      const { client, attachmentsUrl } = await setup();

      const response = await upload(client, attachmentsUrl, TEXT, 'notes.png', 'image/png');

      assert.equal(response.status, 400);
    });

    test('a ZIP sent as a PNG is rejected', async () => {
      const { client, attachmentsUrl } = await setup();

      const response = await upload(client, attachmentsUrl, ZIP, 'archive.png', 'image/png');

      assert.equal(response.status, 400);
    });

    test('a binary sent as text is rejected', async () => {
      const { client, attachmentsUrl } = await setup();

      const response = await upload(client, attachmentsUrl, EXECUTABLE, 'notes.txt', 'text/plain');

      assert.equal(response.status, 400);
    });
  });

  describe('a rejected upload leaves nothing behind', () => {
    test('no attachment record is created', async () => {
      const { client, attachmentsUrl } = await setup();

      await upload(client, attachmentsUrl, EXECUTABLE, 'payload.png', 'image/png');

      assert.equal(await attachmentCount(), 0);
    });

    test('the existing checks still reject before the content check runs', async () => {
      const { client, attachmentsUrl } = await setup();

      // Blocked extension.
      const blocked = await upload(client, attachmentsUrl, PNG, 'payload.html', 'text/html');

      // Extension that does not belong to the declared MIME type.
      const mismatched = await upload(client, attachmentsUrl, PNG, 'photo.txt', 'image/png');

      assert.equal(blocked.status, 400);
      assert.equal(mismatched.status, 400);
      assert.equal(await attachmentCount(), 0);
    });

    test('a rejected avatar leaves no file on disk', async () => {
      const owner = await createUser({ name: 'Owner' });
      const before = avatarFiles();

      const response = await asUser(app, owner)
        .patch(`${API}/users/avatar`)
        .attach('avatar', EXECUTABLE, { filename: 'avatar.png', contentType: 'image/png' });

      assert.equal(response.status, 400);
      assert.deepEqual(avatarFiles(), before, 'the file multer wrote must have been removed');
    });
  });

  describe('the content rules cover every allowed type', () => {
    test('every allowed MIME type has a declared content expectation', () => {
      const declared = Object.keys(MIME_TYPE_EXTENSIONS).sort();
      const covered = [...MIME_TYPES_WITH_CONTENT_RULES].sort();

      assert.deepEqual(
        covered,
        declared,
        'adding an allowed MIME type requires deciding what its content looks like, ' +
          'or the content check silently skips it'
      );
    });
  });
});
