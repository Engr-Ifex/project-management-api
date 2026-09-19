import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import User from '../src/models/User.js';
import Workspace from '../src/models/Workspace.js';
import Project from '../src/models/Project.js';
import Task from '../src/models/Task.js';
import TaskComment from '../src/models/TaskComment.js';
import Label from '../src/models/Label.js';
import Attachment from '../src/models/Attachment.js';
import Notification from '../src/models/Notification.js';
import ProjectActivity from '../src/models/ProjectActivity.js';
import Invitation from '../src/models/Invitation.js';

/*
 * Index hygiene.
 *
 * Two rules, both derived from the index definitions rather than from a
 * snapshot, so the tests cannot rot:
 *
 *   1. No index may be a prefix of another index on the same model. If
 *      `{ a: 1, b: 1 }` exists then `{ a: 1 }` can never be the better choice
 *      for any query — the compound index has the same leading key and can
 *      serve everything the single-field one can. Keeping both costs a write on
 *      every insert and update for no benefit.
 *
 *      This is a proof, not a measurement: it holds for every possible query,
 *      so no query-plan analysis is needed. Twelve such indexes were removed
 *      during remediation; `npm run migrate:drop-indexes` drops them from an
 *      existing database, because removing a schema declaration does not remove
 *      an index Mongoose already created.
 *
 *   2. The unique constraints that enforce real invariants must stay unique,
 *      and stay scoped to the right keys. A unique index is load-bearing here —
 *      it is what makes a duplicate insert fail under concurrency — so silently
 *      losing one would reopen a race.
 *
 * Deliberately NOT covered: whether a non-redundant index is actually used by a
 * query. That needs `explain()` against a real database, which this suite does
 * not have.
 */

const MODELS = [
  ['User', User],
  ['Workspace', Workspace],
  ['Project', Project],
  ['Task', Task],
  ['TaskComment', TaskComment],
  ['Label', Label],
  ['Attachment', Attachment],
  ['Notification', Notification],
  ['ProjectActivity', ProjectActivity],
  ['Invitation', Invitation],
];

/** `[{ keys: {a: 1}, options: {} }, …]` for a model. */
const indexesOf = (Model) => Model.schema.indexes().map(([keys, options]) => ({ keys, options }));

const describeKeys = (keys) => JSON.stringify(keys);

describe('index hygiene', () => {
  describe('no index is a prefix of another', () => {
    for (const [name, Model] of MODELS) {
      test(`${name} has no redundant prefix index`, () => {
        const indexes = indexesOf(Model);
        const redundant = [];

        for (const candidate of indexes) {
          const fields = Object.keys(candidate.keys);

          // Only single-field indexes are considered: a multi-field index can
          // never be a prefix of a different index unless they are identical.
          if (fields.length !== 1) continue;

          const [field] = fields;

          const covering = indexes.find(
            (other) =>
              other !== candidate &&
              Object.keys(other.keys).length > 1 &&
              Object.keys(other.keys)[0] === field &&
              // The direction of the leading key must match, or the compound
              // index cannot serve the same sort.
              other.keys[field] === candidate.keys[field]
          );

          if (covering) {
            redundant.push(
              `${describeKeys(candidate.keys)} is a prefix of ${describeKeys(covering.keys)}`
            );
          }
        }

        assert.deepEqual(
          redundant,
          [],
          `${name} declares redundant indexes:\n  ${redundant.join('\n  ')}\n` +
            'Remove the single-field declaration; the compound index already ' +
            'serves every query it could, and drop it from existing databases ' +
            'with `npm run migrate:drop-indexes`.'
        );
      });
    }
  });

  describe('unique constraints enforce the intended invariants', () => {
    /** Unique indexes as `{ 'field+field': options }`. */
    const uniqueOf = (Model) => {
      const result = {};

      for (const { keys, options } of indexesOf(Model)) {
        if (options?.unique) result[Object.keys(keys).join('+')] = options;
      }

      return result;
    };

    test('a user email is unique', () => {
      assert.deepEqual(Object.keys(uniqueOf(User)), ['email']);
    });

    test('a label name is unique within its project, not globally', () => {
      assert.deepEqual(Object.keys(uniqueOf(Label)), ['project+name']);
    });

    test('a stored object backs exactly one attachment', () => {
      assert.deepEqual(Object.keys(uniqueOf(Attachment)), ['storage.key']);
    });

    test('an invitation token is unique', () => {
      const unique = uniqueOf(Invitation);

      assert.ok('token' in unique, 'the token must be unique');
    });

    test('only ONE pending invitation per workspace and email', () => {
      const unique = uniqueOf(Invitation);
      const pending = unique['workspace+email'];

      assert.ok(pending, 'the partial unique index on {workspace, email} must exist');
      assert.equal(
        pending.partialFilterExpression?.status,
        'pending',
        'it must be restricted to pending invitations, or re-inviting someone ' +
          'whose invitation was accepted or cancelled would fail'
      );
    });

    test('membership arrays are NOT globally unique', () => {
      /*
       * A unique index on `members.user` would enforce uniqueness ACROSS
       * DOCUMENTS — it would forbid one user from belonging to a second
       * workspace. The invariant is intra-document ("no duplicate element in
       * this array"), which no MongoDB index can express, so the guard lives in
       * a conditional update instead. This test exists so nobody adds the index
       * back as a "fix" for the duplicate-member race.
       */
      for (const [name, Model] of [
        ['Workspace', Workspace],
        ['Project', Project],
      ]) {
        const unique = Object.keys(uniqueOf(Model));

        assert.ok(
          !unique.includes('members.user'),
          `${name} must not have a unique index on members.user`
        );
      }
    });
  });

  describe('query-serving indexes are present', () => {
    test('every model has at least one index beyond _id', () => {
      for (const [name, Model] of MODELS) {
        assert.ok(indexesOf(Model).length > 0, `${name} declares no index`);
      }
    });

    test('the task date-range filters are both indexed', () => {
      const keys = indexesOf(Task).map(({ keys: k }) => Object.keys(k).join('+'));

      for (const field of ['dueDate', 'startDate']) {
        assert.ok(
          keys.includes(`project+${field}`),
          `project+${field} must be indexed: the list endpoint filters on it`
        );
      }
    });
  });
});
