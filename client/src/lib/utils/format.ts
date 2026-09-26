/*
 * Formatting helpers.
 *
 * Small and pure, so they can be used in a render without a hook and tested
 * without a DOM. Anything that needs the API's shape belongs in `lib/api`, not
 * here — this file knows nothing about the domain.
 */

/** A byte count as a short human string: `184320` → `180 KB`. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** The lowercase extension of a filename, or an empty string when it has none. */
export const extensionOf = (filename: string): string =>
  filename.includes('.') ? (filename.split('.').pop() ?? '').toLowerCase() : '';

/** A date as the user's local short form, or an em dash when there is none. */
export const formatDate = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleDateString() : '—';

/** A date and time in the user's local form, or an em dash when there is none. */
export const formatDateTime = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString() : '—';

/**
 * Turns a server enum into a sentence: `subtask_created` → `Subtask created`.
 *
 * Used for activity actions, which the API adds to over time — so a lookup table
 * would silently render nothing for a new action, while this degrades to a
 * slightly clumsy label.
 */
export const humaniseEnum = (value: string): string => {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
