import mongoose from 'mongoose';

import env from './env.js';
import logger from '../utils/logger.js';

/*
 * MongoDB connection handling.
 *
 * Two changes from the original, both about surviving in production:
 *
 * 1. `connectDB` no longer calls `process.exit(1)` on failure. Exiting from
 *    inside a library function makes the module untestable and takes the
 *    decision away from the entry point; it now throws and lets `server.js`
 *    decide. `server.js` still exits — a process that cannot reach its
 *    database should not serve traffic — but the policy lives in one place.
 *
 * 2. The connection lifecycle is logged. A dropped or flaky connection is the
 *    single most common cause of "the API is slow" reports, and without these
 *    events the logs go quiet at exactly the moment they become interesting.
 */

/** Human-readable labels for `mongoose.connection.readyState`. */
const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let listenersRegistered = false;

const registerConnectionListeners = () => {
  if (listenersRegistered) return;

  listenersRegistered = true;

  const connection = mongoose.connection;

  connection.on('connected', () => {
    logger.info('MongoDB connected', {
      database: connection.name,
      host: connection.host,
    });
  });

  /*
   * `disconnected` fires on transient network blips too, not only on a
   * permanent loss — the driver reconnects on its own. Logged at warn so it is
   * visible without implying the process is doomed.
   */
  connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  connection.on('error', (error) => {
    logger.error('MongoDB connection error', { error });
  });
};

/**
 * Open the database connection.
 *
 * Resolves once the connection is usable, or throws if it is not. The caller
 * decides whether that is fatal.
 */
export const connectDB = async () => {
  registerConnectionListeners();

  /*
   * `serverSelectionTimeoutMS` bounds how long the driver searches for a
   * reachable server. The 30s default makes an unreachable host look like a
   * hang; the configured value fails fast with an actionable message.
   */
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: env.mongoServerSelectionTimeoutMs,
  });

  return mongoose.connection;
};

/**
 * Close the database connection.
 *
 * Safe to call when already disconnected, so shutdown does not have to track
 * state. `close(false)` waits for in-flight operations to finish rather than
 * forcing them, which avoids surfacing write errors to clients mid-shutdown.
 */
export const closeDatabase = async () => {
  if (mongoose.connection.readyState === 0) return;

  await mongoose.connection.close(false);
};

/** Current connection state as a label, for health reporting. */
export const getDatabaseState = () => READY_STATES[mongoose.connection.readyState] ?? 'unknown';

export default connectDB;
