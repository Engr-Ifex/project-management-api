/*
 * Utilities barrel.
 *
 * Pure helpers with no knowledge of the domain. Anything that needs to
 * understand the API's shape belongs in `lib/api` instead — the split is
 * deliberate, so this folder stays testable without a server or a DOM.
 */

export { cn } from './cn';
export * from './format';
