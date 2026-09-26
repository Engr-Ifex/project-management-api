/*
 * The API layer's public surface. Pages import from `@/lib/api` and nothing
 * deeper, so the internal file split can change without touching a page.
 */

export * from './types';
export * from './client';
export * from './endpoints';
