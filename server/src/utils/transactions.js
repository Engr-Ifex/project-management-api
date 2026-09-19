import mongoose from 'mongoose';

import logger from './logger.js';

/*
 * Multi-document atomicity.
 *
 * MongoDB only offers transactions on a replica set or a sharded cluster. A
 * standalone server — which is what `.env.example` suggests for local work, and
 * what the in-process test store emulates — rejects them outright, and a write
 * inside a transaction fails with "Transaction numbers are only allowed on a
 * replica set member or mongos".
 *
 * So the capability is detected once and the caller degrades predictably rather
 * than the process failing at the first multi-document write.
 *
 * IMPORTANT — what the fallback does and does not give you.
 *
 * Without transaction support, `runAtomically` runs the work sequentially and
 * the individual writes still apply. Every invariant this codebase relies on is
 * therefore enforced by a *single-document* atomic operation (a conditional
 * `findOneAndUpdate`, `$addToSet`, `$pull`) or by a unique index — never by the
 * transaction. The transaction narrows the window in which a partial failure
 * can leave two documents disagreeing; it is not what makes the invariant hold.
 *
 * That distinction is deliberate: it means the correctness of the API does not
 * depend on the deployment topology, and the transactional path is an
 * improvement rather than a requirement.
 */

/** Cached result — the topology does not change while the process runs. */
let cachedSupport = null;

/** Warn once, not on every call, so a fallback cannot flood the log. */
let warnedAboutFallback = false;

/**
 * Does the connected deployment support multi-document transactions?
 *
 * `hello` reports `setName` on a replica set member and `msg: 'isdbgrid'` on a
 * mongos. Anything else — including the in-process test store, which has no
 * real connection — is treated as standalone.
 */
export const supportsTransactions = async () => {
  if (cachedSupport !== null) return cachedSupport;

  const client = mongoose.connection?.client;

  if (!client || mongoose.connection.readyState !== 1) {
    cachedSupport = false;

    return cachedSupport;
  }

  try {
    const hello = await client.db('admin').admin().command({ hello: 1 });

    cachedSupport = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    cachedSupport = false;
  }

  return cachedSupport;
};

/** Reset the cached topology. Test-only. */
export const resetTransactionSupportCache = () => {
  cachedSupport = null;
  warnedAboutFallback = false;
};

/**
 * Run `work` atomically when the deployment allows it.
 *
 * `work` receives a session to pass to every write it performs, or `null` when
 * transactions are unavailable — in which case the writes still run, in order,
 * and the caller's invariants must not depend on rollback.
 *
 * A failure inside a transaction aborts it and the error propagates unchanged,
 * so the error middleware maps it exactly as it would outside one.
 *
 * `dependencies` exists so the transactional branch can be tested at all. A
 * replica set is the only thing that exercises it in production, and this
 * environment has none, so the commit/abort/session-cleanup behaviour would
 * otherwise ship unverified. It is not used by application code.
 */
export const runAtomically = async (work, dependencies = {}) => {
  const {
    supportsTransactions: isSupported = supportsTransactions,
    startSession = () => mongoose.startSession(),
  } = dependencies;

  if (!(await isSupported())) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;

      logger.warn(
        'MongoDB deployment does not support transactions (standalone server): ' +
          'multi-document operations run sequentially. Every invariant is enforced by ' +
          'single-document atomic updates, so this is safe — but a partial failure can ' +
          'leave documents that disagree. Use a replica set to remove that window.'
      );
    }

    return work(null);
  }

  const session = await startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      result = await work(session);
    });

    return result;
  } finally {
    /*
     * Always released. A session left open holds a server-side resource and,
     * on a replica set, pins the snapshot the transaction was reading.
     */
    await session.endSession();
  }
};
