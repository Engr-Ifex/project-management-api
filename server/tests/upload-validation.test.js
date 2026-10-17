import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { startTestDatabase, clearDatabase, stopTestDatabase } from './helpers/setup.js';
import { asUser, createProject, createUser, createWorkspace } from './helpers/factories.js';

import { PUBLIC_AVATARS_DIR } from '../src/config/paths.js';
import { MIME_TYPE_EXTENSIONS } from '../src/constants/attachment.js';
import { AVATAR_ALLOWED_MIME_TYPES } from '../src/middlewares/upload.middleware.js';
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
    test('every allowed attachment MIME type has a declared content expectation', () => {
      const missing = Object.keys(MIME_TYPE_EXTENSIONS).filter(
        (mimeType) => !MIME_TYPES_WITH_CONTENT_RULES.includes(mimeType)
      );

      assert.deepEqual(
        missing,
        [],
        `allowed attachment MIME types with no content rule:\n  ${missing.join('\n  ')}\n` +
          'Adding an allowed type requires deciding what its content looks like, or ' +
          'the content check silently skips it.'
      );
    });

    test('every allowed avatar MIME type has a declared content expectation', () => {
      /*
       * Avatars use a SEPARATE allow-list from attachments, so this is not
       * covered by the test above — and the gap was real: `image/jpg` (the
       * common misspelling of `image/jpeg`) was accepted by the avatar filter
       * but had no content rule, so a genuine JPEG sent with that type was
       * rejected. Both lists must be covered.
       */
      const missing = AVATAR_ALLOWED_MIME_TYPES.filter(
        (mimeType) => !MIME_TYPES_WITH_CONTENT_RULES.includes(mimeType)
      );

      assert.deepEqual(
        missing,
        [],
        `avatar MIME types with no content rule:\n  ${missing.join('\n  ')}\n` +
          'Add a rule in CONTENT_FOR_MIME_TYPE, or the upload will be refused.'
      );
    });

    test('no content rule is dead', () => {
      /*
       * The reverse direction: a rule for a MIME type no allow-list accepts can
       * never run. Not harmful, but it hides the fact that a type was removed
       * from a list and the rule was left behind.
       */
      const accepted = new Set([
        ...Object.keys(MIME_TYPE_EXTENSIONS),
        ...AVATAR_ALLOWED_MIME_TYPES,
      ]);

      const orphans = MIME_TYPES_WITH_CONTENT_RULES.filter((mimeType) => !accepted.has(mimeType));

      assert.deepEqual(
        orphans,
        [],
        `content rules for types nothing accepts:\n  ${orphans.join('\n  ')}`
      );
    });

    test('a JPEG sent as image/jpg is accepted', async () => {
      const owner = await createUser({ name: 'Owner' });
      const before = avatarFiles();

      const response = await asUser(app, owner)
        .patch(`${API}/users/avatar`)
        .attach('avatar', JPEG, { filename: 'photo.jpg', contentType: 'image/jpg' });

      assert.equal(response.status, 200, response.body.message);

      // Remove the accepted avatar so the test leaves no file behind.
      for (const file of avatarFiles().filter((file) => !before.includes(file))) {
        fs.unlinkSync(`${PUBLIC_AVATARS_DIR}/${file}`);
      }
    });
  });
});

/*
 * The avatar upload, end to end.
 *
 * The rejection paths above were already covered; what was not covered is the
 * success path, and that gap is why a broken avatar upload looked like a
 * backend problem. The API returns a **relative** `/uploads/avatars/<file>`
 * path on the user, and the frontend renders it directly as an `<img src>`. So
 * the contract has two halves — the path is stored on the user, and the file is
 * reachable at that path — and both are asserted here.
 *
 * The reachability half is what actually broke: the client's dev server proxied
 * `/api` but not `/uploads`, so the browser received the SPA's HTML instead of
 * the image and the avatar silently fell back to initials. That is a client
 * concern and is fixed in `client/vite.config.ts`; what belongs here is proof
 * that the server half is sound, so the two can be told apart.
 */
describe('avatar upload', () => {
  /** Removes any avatar files created since `before`. */
  const cleanUpAfter = (before) => {
    for (const file of avatarFiles().filter((file) => !before.includes(file))) {
      fs.unlinkSync(`${PUBLIC_AVATARS_DIR}/${file}`);
    }
  };

  const uploadAvatar = (client, buffer, filename, contentType) =>
    client.patch(`${API}/users/avatar`).attach('avatar', buffer, { filename, contentType });

  test('a JPEG is stored and the path is saved on the user', async () => {
    const owner = await createUser({ name: 'Owner' });
    const before = avatarFiles();
    const client = asUser(app, owner);

    const response = await uploadAvatar(client, JPEG, 'photo.jpg', 'image/jpeg');

    assert.equal(response.status, 200, response.body.message);

    const storedPath = response.body.data.user.avatar;

    assert.match(storedPath, /^\/uploads\/avatars\/avatar-[\w.-]+\.jpg$/);

    // The file must exist at the path the API just handed back.
    const filename = storedPath.split('/').pop();
    assert.ok(
      fs.existsSync(`${PUBLIC_AVATARS_DIR}/${filename}`),
      'the avatar file should exist on disk'
    );

    // And the path must survive a fresh read, not just the mutation response.
    const profile = await client.get(`${API}/users/profile`);
    assert.equal(profile.body.data.user.avatar, storedPath);

    cleanUpAfter(before);
  });

  test('a PNG is stored and the path is saved on the user', async () => {
    const owner = await createUser({ name: 'Owner' });
    const before = avatarFiles();

    const response = await uploadAvatar(asUser(app, owner), PNG, 'photo.png', 'image/png');

    assert.equal(response.status, 200, response.body.message);
    assert.match(response.body.data.user.avatar, /^\/uploads\/avatars\/avatar-[\w.-]+\.png$/);

    cleanUpAfter(before);
  });

  test('rejects a type that is not an avatar image', async () => {
    const owner = await createUser({ name: 'Owner' });
    const before = avatarFiles();

    // GIF is a valid image and a valid *attachment*, but not an avatar type.
    const response = await uploadAvatar(asUser(app, owner), GIF, 'animation.gif', 'image/gif');

    assert.equal(response.status, 400);
    assert.deepEqual(avatarFiles(), before, 'a rejected upload must write nothing');

    cleanUpAfter(before);
  });

  test('rejects a file over the size limit', async () => {
    const owner = await createUser({ name: 'Owner' });
    const before = avatarFiles();

    // Valid PNG signature, so it fails on size rather than on content.
    const oversized = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(5 * 1024 * 1024 + 1),
    ]);

    const response = await uploadAvatar(asUser(app, owner), oversized, 'big.png', 'image/png');

    assert.equal(response.status, 400);
    assert.deepEqual(avatarFiles(), before, 'an oversized upload must write nothing');

    cleanUpAfter(before);
  });

  test('a rejected replacement leaves the previous avatar intact', async () => {
    const owner = await createUser({ name: 'Owner' });
    const before = avatarFiles();
    const client = asUser(app, owner);

    const first = await uploadAvatar(client, JPEG, 'photo.jpg', 'image/jpeg');
    assert.equal(first.status, 200);

    const originalPath = first.body.data.user.avatar;
    const afterFirstUpload = avatarFiles();

    // Content that does not match its declared type.
    const rejected = await uploadAvatar(
      client,
      Buffer.from('not-an-image-at-all'),
      'fake.jpg',
      'image/jpeg'
    );
    assert.equal(rejected.status, 400);

    assert.deepEqual(avatarFiles(), afterFirstUpload, 'the rejected file must be removed');

    const profile = await client.get(`${API}/users/profile`);
    assert.equal(
      profile.body.data.user.avatar,
      originalPath,
      'a failed replacement must not clear or change the existing avatar'
    );

    cleanUpAfter(before);
  });

  test('an anonymous request cannot set an avatar', async () => {
    const before = avatarFiles();

    const response = await request(app)
      .patch(`${API}/users/avatar`)
      .attach('avatar', JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    assert.equal(response.status, 401);
    assert.deepEqual(avatarFiles(), before);

    cleanUpAfter(before);
  });

  test('the upload is attributed to the caller, never to a supplied id', async () => {
    const owner = await createUser({ name: 'Owner' });
    const other = await createUser({ name: 'Other' });
    const before = avatarFiles();

    // The endpoint takes the id from the session. A body field naming another
    // user must be ignored rather than honoured.
    const response = await asUser(app, owner)
      .patch(`${API}/users/avatar`)
      .field('userId', String(other._id))
      .attach('avatar', JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    assert.equal(response.status, 200);

    const { default: User } = await import('../src/models/User.js');
    const reloadedOther = await User.findById(other._id);

    assert.equal(reloadedOther.avatar, null, "another user's avatar must be untouched");

    cleanUpAfter(before);
  });
});
