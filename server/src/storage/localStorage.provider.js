import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

import ApiError from '../utils/ApiError.js';
import { OBJECT_ID_REGEX } from '../constants/regex.js';
import { PRIVATE_ATTACHMENTS_DIR } from '../config/paths.js';

/*
 * Local disk storage provider.
 *
 * Implements the storage contract defined in `storageProvider.js`:
 *
 *   name                     -> 'local'
 *   save({ buffer, extension, scope }) -> { key, storedFilename, size }
 *   remove(key)              -> Promise<boolean>
 *   exists(key)              -> Promise<boolean>
 *   createReadStream(key)    -> Readable
 *   resolvePath(key)         -> absolute path (local-only helper)
 *
 * Everything that is specific to "files live on this machine" is contained
 * here. Swapping in S3/GCS later means adding a sibling provider that returns
 * an object key from `save()` and a stream from `createReadStream()`; the
 * attachment service never has to change.
 */

const BASE_DIR = PRIVATE_ATTACHMENTS_DIR;

// Stored filenames are generated, so a strict extension shape is enough.
const SAFE_EXTENSION_REGEX = /^\.[a-z0-9]{1,10}$/;

const ensureBaseDir = () => {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
};

/**
 * Normalise a provider key and reject anything that could escape the base
 * directory (absolute paths, `..` segments, backslashes, null bytes).
 */
const assertSafeKey = (key) => {
  if (typeof key !== 'string' || key.length === 0) {
    throw new ApiError(400, 'Invalid storage key');
  }

  if (key.includes('\0') || key.includes('\\')) {
    throw new ApiError(400, 'Invalid storage key');
  }

  const normalized = path.posix.normalize(key);

  if (
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..')
  ) {
    throw new ApiError(400, 'Invalid storage key');
  }

  return normalized;
};

/**
 * Resolve a key to an absolute path, then re-verify containment.
 *
 * The second check is belt-and-braces: even if `assertSafeKey` were bypassed,
 * the resolved path must still live inside BASE_DIR.
 */
const resolvePath = (key) => {
  const safeKey = assertSafeKey(key);

  const absolutePath = path.resolve(BASE_DIR, safeKey);

  const baseWithSeparator = BASE_DIR.endsWith(path.sep) ? BASE_DIR : `${BASE_DIR}${path.sep}`;

  if (absolutePath !== BASE_DIR && !absolutePath.startsWith(baseWithSeparator)) {
    throw new ApiError(400, 'Invalid storage key');
  }

  return absolutePath;
};

/**
 * Group stored files per project so a project's binaries can be inspected or
 * purged as a unit. Falls back to `misc` for a non-ObjectId scope.
 */
const resolveScopeSegment = (scope) => {
  if (typeof scope === 'string' && OBJECT_ID_REGEX.test(scope)) {
    return scope;
  }

  return 'misc';
};

const localStorageProvider = {
  name: 'local',

  /**
   * Persist a buffer and return its provider key.
   *
   * The stored filename is always generated (UUID + validated extension), so
   * the user-supplied original name never reaches the filesystem.
   */
  async save({ buffer, extension, scope }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ApiError(400, 'Cannot store an empty file');
    }

    if (!SAFE_EXTENSION_REGEX.test(extension)) {
      throw new ApiError(400, 'Invalid file extension');
    }

    const scopeSegment = resolveScopeSegment(scope);

    const storedFilename = `${crypto.randomUUID()}${extension}`;

    const key = `${scopeSegment}/${storedFilename}`;

    const absolutePath = resolvePath(key);

    ensureBaseDir();

    await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsp.writeFile(absolutePath, buffer);

    return {
      key,
      storedFilename,
      size: buffer.length,
    };
  },

  async remove(key) {
    const absolutePath = resolvePath(key);

    try {
      await fsp.unlink(absolutePath);
      return true;
    } catch (error) {
      // A missing file is already the desired end state.
      if (error.code === 'ENOENT') {
        return false;
      }

      throw error;
    }
  },

  async exists(key) {
    try {
      await fsp.access(resolvePath(key), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },

  createReadStream(key) {
    return fs.createReadStream(resolvePath(key));
  },

  resolvePath,
};

export { BASE_DIR };
export default localStorageProvider;
