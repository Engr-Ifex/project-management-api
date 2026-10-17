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

/*
 * ---------------------------------------------------------------------------
 * Calendar dates
 * ---------------------------------------------------------------------------
 *
 * `startDate`, `dueDate` and a project `deadline` are **calendar dates**, not
 * instants: "the 12th of October" is the same day for everyone, and nobody
 * means "midnight UTC on the 12th".
 *
 * The API models them as ISO datetimes, and the app's convention — established
 * in `ProjectSettingsTab` and `TaskProperties` — is to store the picked day as
 * `T00:00:00.000Z`. That is a storage detail, and it must not leak into the
 * rendering: `new Date('2026-10-12T00:00:00.000Z').toLocaleDateString()` in
 * UTC-7 returns **10/11/2026**, so a user who picked the 12th was shown the
 * 11th. Rendering these in UTC makes pick → store → display round-trip exactly,
 * in every timezone.
 *
 * Timestamps that *are* instants — `createdAt`, `updatedAt`, `joinedAt` — must
 * keep using `formatDate`, because there the local rendering is correct.
 */

/** A `<input type="date">` value (`yyyy-mm-dd`) for a stored calendar date, or `''`. */
export const toDateInputValue = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10) : '';

/**
 * The reverse: a `<input type="date">` value becomes the ISO datetime the API
 * requires, or `null` to clear the field.
 *
 * A date input produces `yyyy-mm-dd`, but the API validates with
 * `z.string().datetime()`, which requires a full ISO timestamp with a timezone.
 * Sending the bare date is a 400 — which is what made "add a due date" fail
 * while "add no due date" worked, since the omitted field never reached the
 * validator.
 */
export const fromDateInputValue = (value: string): string | null =>
  value ? `${value}T00:00:00.000Z` : null;

/**
 * A stored calendar date as the user's short form, read back in UTC so the
 * displayed day matches the day that was picked.
 */
export const formatCalendarDate = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '—';

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
