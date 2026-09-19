import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  runAtomically,
  supportsTransactions,
  resetTransactionSupportCache,
} from '../src/utils/transactions.js';

/*
 * Multi-document atomicity.
 *
 * MongoDB only offers transactions on a replica set, and neither the in-process
 * store used by this suite nor a standalone server is one. The transactional
 * branch would therefore never run in CI and would ship unverified, so
 * `runAtomically` accepts its session plumbing as an injected dependency and
 * the commit, abort and cleanup paths are driven directly here.
 *
 * What this does NOT prove: that MongoDB rolls back correctly. That is the
 * server's guarantee. What it proves is that the wrapper starts a session,
 * commits only on success, releases the session on every path, and hands the
 * caller's error back unchanged.
 */

/** A session stand-in that records what the wrapper did to it. */
const fakeSession = ({ fail = null } = {}) => {
  const calls = { committed: 0, aborted: 0, ended: 0 };

  return {
    calls,
    session: {
      withTransaction: async (body) => {
        try {
          await body();

          calls.committed += 1;
        } catch (error) {
          calls.aborted += 1;

          throw error;
        }
      },
      endSession: async () => {
        calls.ended += 1;
      },
    },
    fail,
  };
};

describe('transaction support detection', () => {
  beforeEach(() => {
    resetTransactionSupportCache();
  });

  test('a deployment without a real connection reports no support', async () => {
    /*
     * The in-process store has no driver connection, which is the same shape a
     * standalone server presents to this check.
     */
    assert.equal(await supportsTransactions(), false);
  });

  test('the result is cached after the first check', async () => {
    const first = await supportsTransactions();
    const second = await supportsTransactions();

    assert.equal(first, second);
  });
});

describe('runAtomically without transaction support', () => {
  beforeEach(() => {
    resetTransactionSupportCache();
  });

  test('runs the work with a null session and returns its result', async () => {
    const value = { ok: true };
    let received = 'not-called';

    const result = await runAtomically(async (session) => {
      received = session;

      return value;
    });

    assert.equal(received, null, 'the work is told there is no session');
    assert.equal(result, value);
  });

  test('propagates the caller\u2019s error unchanged', async () => {
    const failure = new Error('write failed');

    await assert.rejects(
      () =>
        runAtomically(async () => {
          throw failure;
        }),
      (error) => error === failure
    );
  });
});

describe('runAtomically with transaction support', () => {
  const withSession = (session, { supported = true } = {}) => ({
    supportsTransactions: async () => supported,
    startSession: async () => session,
  });

  test('commits once and releases the session on success', async () => {
    const { session, calls } = fakeSession();
    const value = { ok: true };

    const result = await runAtomically(async (active) => {
      assert.equal(active, session, 'the work receives the session to write with');

      return value;
    }, withSession(session));

    assert.equal(result, value);
    assert.equal(calls.committed, 1);
    assert.equal(calls.aborted, 0);
    assert.equal(calls.ended, 1, 'the session must always be released');
  });

  test('aborts and releases the session when the work throws', async () => {
    const { session, calls } = fakeSession();
    const failure = new Error('constraint violated');

    await assert.rejects(
      () =>
        runAtomically(async () => {
          throw failure;
        }, withSession(session)),
      (error) => error === failure
    );

    assert.equal(calls.committed, 0, 'a failed transaction must not commit');
    assert.equal(calls.aborted, 1);
    assert.equal(calls.ended, 1, 'the session must be released even on failure');
  });

  test('does not leak the session when the commit itself fails', async () => {
    let ended = 0;
    const session = {
      withTransaction: async () => {
        throw new Error('commit failed');
      },
      endSession: async () => {
        ended += 1;
      },
    };

    await assert.rejects(() => runAtomically(async () => 'never', withSession(session)));

    assert.equal(ended, 1);
  });

  test('an unsupported deployment is not wrapped in a session', async () => {
    const { session, calls } = fakeSession();

    const result = await runAtomically(
      async (active) => {
        assert.equal(active, null);

        return 'done';
      },
      withSession(session, { supported: false })
    );

    assert.equal(result, 'done');
    assert.equal(calls.committed + calls.aborted + calls.ended, 0, 'no session is opened');
  });
});
