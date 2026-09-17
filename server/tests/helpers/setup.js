import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';

/*
 * Test environment bootstrap.
 *
 * MUST be imported before anything that reads configuration, because
 * `src/config/env.js` reads `process.env` exactly once, at import time.
 *
 * Database strategy
 * -----------------
 *   TEST_DB=mongodb  -> require a real database (mongodb-memory-server, or
 *                       `MONGODB_URI_TEST`); fail loudly if unavailable
 *   TEST_DB=memory   -> force the in-process store
 *   TEST_DB=auto     -> (default) real database when one is available,
 *                       otherwise the in-process store
 *
 * A guard refuses any URI that looks like a remote cluster, so the production
 * database can never be reached by a test run.
 *
 * The in-process store exists so the suite still runs in a clean environment
 * with no network and no cached mongod binary. It is selected only when a real
 * database is genuinely unavailable, and it says so in the output. See
 * `memoryStore.js` for exactly what it does and does not reproduce.
 */

process.env.NODE_ENV = 'test';

/*
 * A deterministic, strong-enough secret for the test run. Setting it before
 * `dotenv` runs means the value from `.env` is ignored (dotenv never overrides
 * an existing variable).
 */
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET_TEST || 'test-only-jwt-secret-value-at-least-32-chars';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.COOKIE_MAX_AGE = '900000';
process.env.BCRYPT_SALT_ROUNDS = '10';

/*
 * Placeholder that stops `dotenv` from loading the real connection string out
 * of `.env`. Replaced below with the test database.
 */
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/placeholder-never-used';

const TEST_DB_MODE = process.env.TEST_DB || 'auto';
const MONGODB_VERSION = process.env.MONGOMS_VERSION || '6.0.14';

let app = null;
let usingRealDatabase = false;
let memoryServer = null;

const assertIsolated = (uri) => {
  if (!uri || /mongodb\+srv:|\.mongodb\.net/i.test(uri)) {
    throw new Error(
      'Refusing to run the test suite against a remote MongoDB. ' +
        'Set MONGODB_URI_TEST to a disposable local instance instead.'
    );
  }
};

/** Every model the app registers, in dependency order. */
const loadModels = async () => {
  const modules = await Promise.all([
    import('../../src/models/User.js'),
    import('../../src/models/Workspace.js'),
    import('../../src/models/Project.js'),
    import('../../src/models/Task.js'),
    import('../../src/models/TaskComment.js'),
    import('../../src/models/Label.js'),
    import('../../src/models/Notification.js'),
    import('../../src/models/ProjectActivity.js'),
    import('../../src/models/Attachment.js'),
    import('../../src/models/Invitation.js'),
  ]);

  return modules.map((module) => module.default);
};

/**
 * Is a mongod binary already downloaded?
 *
 * Checked before asking mongodb-memory-server to start, because a missing
 * binary triggers a very large download in the middle of a test run. Falling
 * through to the in-process store keeps a clean environment fast and offline.
 */
const findMongodBinary = async (dir, depth = 0) => {
  if (depth > 4) return false;

  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (entry.isFile() && /^mongod(\.exe)?$/i.test(entry.name)) return true;
    if (entry.isDirectory() && (await findMongodBinary(path.join(dir, entry.name), depth + 1))) {
      return true;
    }
  }

  return false;
};

const hasCachedMongod = async () => {
  const dirs = [
    process.env.MONGOMS_DOWNLOAD_DIR,
    path.join(os.homedir(), '.cache', 'mongodb-binaries'),
  ].filter(Boolean);

  for (const dir of dirs) {
    if (await findMongodBinary(dir)) return true;
  }

  return false;
};

const useMemoryStore = async () => {
  const { installAll } = await import('./memoryStore.js');

  installAll(await loadModels());

  usingRealDatabase = false;
};

const useRealDatabase = async (uri) => {
  assertIsolated(uri);

  process.env.MONGODB_URI = uri;

  await mongoose.connect(uri);

  usingRealDatabase = true;
};

const startInMemoryMongo = async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');

  memoryServer = await MongoMemoryServer.create({
    instance: {
      version: MONGODB_VERSION,
      ...(process.env.MONGOMS_DBPATH ? { dbPath: process.env.MONGOMS_DBPATH } : {}),
    },
  });

  return memoryServer.getUri();
};

export const startTestDatabase = async () => {
  const externalUri = process.env.MONGODB_URI_TEST;

  if (externalUri) {
    await useRealDatabase(externalUri);
  } else if (TEST_DB_MODE === 'memory') {
    await useMemoryStore();
  } else if (TEST_DB_MODE === 'mongodb' || (await hasCachedMongod())) {
    try {
      await useRealDatabase(await startInMemoryMongo());
    } catch (error) {
      if (TEST_DB_MODE === 'mongodb') throw error;

      console.warn(`⚠️  Could not start mongodb-memory-server: ${error.message}`);
      console.warn('⚠️  Falling back to the in-process store.');

      await useMemoryStore();
    }
  } else {
    console.warn(
      '⚠️  No cached mongod binary found: running against the in-process store.\n' +
        '⚠️  Real query planning and index behaviour are NOT covered by this run.\n' +
        '⚠️  For a real database run:  TEST_DB=mongodb npm test'
    );

    await useMemoryStore();
  }

  const module = await import('../../app.js');
  app = module.default;

  return app;
};

export const getApp = () => {
  if (!app) throw new Error('startTestDatabase() must run before getApp()');

  return app;
};

export const isUsingRealDatabase = () => usingRealDatabase;

export const getTestMode = () => (usingRealDatabase ? 'mongodb' : 'memory');

export const stopTestDatabase = async () => {
  if (usingRealDatabase) {
    await mongoose.disconnect();
  }

  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
};

/** Wipe every collection between tests. */
export const clearDatabase = async () => {
  if (usingRealDatabase) {
    const { collections } = mongoose.connection;

    await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));

    return;
  }

  const { resetStore } = await import('./memoryStore.js');

  resetStore();
};
