import localStorageProvider from './localStorage.provider.js';

/*
 * Storage provider registry.
 *
 * Business logic (attachment.service.js) only ever talks to the active
 * provider through this contract, so the physical storage backend can be
 * replaced without rewriting services:
 *
 *   name                              -> provider identifier stored on the record
 *   save({ buffer, extension, scope }) -> { key, storedFilename, size }
 *   remove(key)                        -> Promise<boolean>
 *   exists(key)                        -> Promise<boolean>
 *   createReadStream(key)              -> Readable
 *
 * `key` is intentionally opaque: the local provider returns a relative path,
 * while a future cloud provider would return an object key / blob name.
 * No cloud credentials belong in this file — a cloud provider would read them
 * from the environment.
 */

export const STORAGE_PROVIDERS = Object.freeze({
  LOCAL: 'local',
});

const providers = Object.freeze({
  [STORAGE_PROVIDERS.LOCAL]: localStorageProvider,
});

/**
 * Resolve the active provider. Defaults to local disk storage.
 */
export const getStorageProvider = (name = STORAGE_PROVIDERS.LOCAL) => {
  const provider = providers[name];

  if (!provider) {
    throw new Error(`Unsupported storage provider: ${name}`);
  }

  return provider;
};

export default getStorageProvider;
