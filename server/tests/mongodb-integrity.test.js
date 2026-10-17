import { before, after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startTestDatabase,
  clearDatabase,
  stopTestDatabase,
  isUsingRealDatabase,
} from './helpers/setup.js';
import { createUser, createWorkspace, createProject, createLabel } from './helpers/factories.js';

/*
 * Database-level integrity.
 *
 * Everything here needs a REAL MongoDB and is skipped without one. That is the
 * point: `indexes.test.js` proves the *declarations* are correct, and
 * `transactions.test.js` proves the *wrapper* commits and aborts, but neither
 * can show that MongoDB itself created the indexes or rolled a transaction
 * back. Those are the server's guarantees, and this file is where they are
 * actually exercised.
 *
 * Run with:  TEST_DB=mongodb npm test
 *
 * The suite's default in-process store emulates operators one at a time, so it
 * cannot fail a duplicate insert the way a unique index does, and it has no
 * sessions at all. Asserting these behaviours against it would prove nothing,
 * which is why they are skipped rather than faked.
 */

before(async () => {
  // Every assertion goes through the models, so the app instance is not kept.
  await startTestDatabase();
});

after(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearDatabase();
});

/** Skip with an explicit reason rather than passing vacuously. */
const requireRealDatabase = (t) => {
  if (!isUsingRealDatabase()) {
    t.skip('requires a real MongoDB; run with TEST_DB=mongodb');
    return false;
  }

  return true;
};

const indexesFor = async (Model) => Model.collection.indexes();

const indexKeys = (indexes) => indexes.map((index) => Object.keys(index.key).join('+'));

describe('database integrity (real MongoDB)', () => {
  describe('declared indexes exist in the database', () => {
    test('every declared index was actually created', async (t) => {
      if (!requireRealDatabase(t)) return;

      const cases = [
        ['User', (await import('../src/models/User.js')).default],
        ['Workspace', (await import('../src/models/Workspace.js')).default],
        ['Project', (await import('../src/models/Project.js')).default],
        ['Task', (await import('../src/models/Task.js')).default],
        ['Label', (await import('../src/models/Label.js')).default],
        ['Attachment', (await import('../src/models/Attachment.js')).default],
        ['Invitation', (await import('../src/models/Invitation.js')).default],
        ['Notification', (await import('../src/models/Notification.js')).default],
      ];

      for (const [name, Model] of cases) {
        /*
         * Wait for Mongoose's automatic index build to finish. `init()`
         * resolves when the model is ready — including the background
         * `createIndexes` that `autoIndex` runs on connect — so the assertion
         * below reads the database's real index set rather than racing it.
         *
         * `syncIndexes()` is deliberately NOT used: it reconciles by DROPPING
         * undeclared indexes, which would make this test destructive.
         */
        await Model.init();

        const present = indexKeys(await indexesFor(Model));
        const declared = indexKeys(Model.schema.indexes().map(([key]) => ({ key })));

        for (const declaredKey of declared) {
          assert.ok(
            present.includes(declaredKey),
            `${name} declares {${declaredKey}} but the database has: ${present.join(', ')}`
          );
        }
      }
    });

    test('the invitation partial unique index exists with its filter', async (t) => {
      if (!requireRealDatabase(t)) return;

      const Invitation = (await import('../src/models/Invitation.js')).default;

      await Invitation.init();

      const indexes = await indexesFor(Invitation);
      const partial = indexes.find((index) => index.name === 'one_pending_invitation_per_email');

      assert.ok(partial, 'the named partial index must exist');
      assert.equal(partial.unique, true, 'it must be unique');
      assert.deepEqual(
        partial.partialFilterExpression,
        { status: 'pending' },
        'it must be restricted to pending invitations'
      );
    });
  });

  describe('unique constraints are enforced by the database', () => {
    test('a duplicate user email is rejected', async (t) => {
      if (!requireRealDatabase(t)) return;

      const User = (await import('../src/models/User.js')).default;

      await User.create({ name: 'One', email: 'dupe@test.local', password: 'password123' });

      await assert.rejects(
        () => User.create({ name: 'Two', email: 'dupe@test.local', password: 'password123' }),
        (error) => error.code === 11000,
        'the second insert must hit the unique index'
      );
    });

    test('a duplicate label name within one project is rejected, but not across projects', async (t) => {
      if (!requireRealDatabase(t)) return;

      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const first = await createProject(workspace, owner, { name: 'First' });
      const second = await createProject(workspace, owner, { name: 'Second' });

      await createLabel(first, { name: 'Bug' });

      await assert.rejects(
        () => createLabel(first, { name: 'Bug' }),
        (error) => error.code === 11000,
        'the same name in the same project must collide'
      );

      // Scoped to the project: the same name elsewhere is fine.
      const other = await createLabel(second, { name: 'Bug' });

      assert.ok(other._id, 'the same label name in another project must be allowed');
    });

    test('two pending invitations for one email collide, but an expired one does not block', async (t) => {
      if (!requireRealDatabase(t)) return;

      const Invitation = (await import('../src/models/Invitation.js')).default;

      const owner = await createUser();
      const workspace = await createWorkspace(owner);

      const base = {
        workspace: workspace._id,
        invitedBy: owner._id,
        email: 'invitee@test.local',
        role: 'member',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      await Invitation.create({ ...base, token: '1'.repeat(64) });

      await assert.rejects(
        () => Invitation.create({ ...base, token: '2'.repeat(64) }),
        (error) => error.code === 11000,
        'a second PENDING invitation must collide'
      );

      // Marking the first expired frees the slot: this is the behaviour the
      // partial filter exists for.
      await Invitation.updateOne({ token: '1'.repeat(64) }, { $set: { status: 'expired' } });

      const fresh = await Invitation.create({ ...base, token: '3'.repeat(64) });

      assert.ok(fresh._id, 'an expired invitation must not block a new pending one');
    });

    test('an invitation token is unique', async (t) => {
      if (!requireRealDatabase(t)) return;

      const Invitation = (await import('../src/models/Invitation.js')).default;

      const owner = await createUser();
      const workspace = await createWorkspace(owner);
      const token = '9'.repeat(64);

      const base = {
        workspace: workspace._id,
        invitedBy: owner._id,
        role: 'member',
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      await Invitation.create({ ...base, email: 'a@test.local' });

      await assert.rejects(
        () => Invitation.create({ ...base, email: 'b@test.local' }),
        (error) => error.code === 11000,
        'a reused token must collide'
      );
    });
  });

  describe('transactions', () => {
    test('the replica set reports transaction support', async (t) => {
      if (!requireRealDatabase(t)) return;

      const { supportsTransactions } = await import('../src/utils/transactions.js');

      assert.equal(
        await supportsTransactions(),
        true,
        'a replica-set deployment must report transaction support'
      );
    });

    test('a committed transaction persists its writes', async (t) => {
      if (!requireRealDatabase(t)) return;

      const { runAtomically } = await import('../src/utils/transactions.js');
      const Project = (await import('../src/models/Project.js')).default;

      const owner = await createUser();
      const workspace = await createWorkspace(owner);

      await runAtomically(async (session) => {
        await Project.create(
          [{ workspace: workspace._id, createdBy: owner._id, name: 'Committed' }],
          session ? { session } : undefined
        );
      });

      assert.equal(await Project.countDocuments({ name: 'Committed' }), 1);
    });

    test('a failed transaction rolls its writes back', async (t) => {
      if (!requireRealDatabase(t)) return;

      /*
       * The gap this closes: `transactions.test.js` proves the wrapper aborts,
       * but nothing proved MongoDB actually discarded the writes. If rollback
       * did not work, `acceptInvitation` could leave a member holding a still
       * pending invitation on a partial failure — and no test would notice.
       */
      const { runAtomically } = await import('../src/utils/transactions.js');
      const Project = (await import('../src/models/Project.js')).default;

      const owner = await createUser();
      const workspace = await createWorkspace(owner);

      const before = await Project.countDocuments({});

      await assert.rejects(
        () =>
          runAtomically(async (session) => {
            await Project.create(
              [{ workspace: workspace._id, createdBy: owner._id, name: 'Rolled Back' }],
              session ? { session } : undefined
            );

            throw new Error('deliberate failure inside the transaction');
          }),
        /deliberate failure/
      );

      assert.equal(
        await Project.countDocuments({ name: 'Rolled Back' }),
        0,
        'the write must have been rolled back'
      );
      assert.equal(await Project.countDocuments({}), before, 'the collection is unchanged');
    });
  });
});
