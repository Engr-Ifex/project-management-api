import path from 'path';

/*
 * Filename safety helpers.
 *
 * Uploaded filenames are attacker-controlled input. They are never used to
 * build a filesystem path (stored names are generated), but they are kept for
 * display and download, so they must still be stripped of anything that could
 * break a header, a log line, or a client.
 */

const MAX_FILENAME_LENGTH = 200;
const FALLBACK_FILENAME = 'file';
const SAFE_EXTENSION_REGEX = /^\.[a-z0-9]{1,10}$/;

/**
 * Reduce an uploaded filename to a safe display name.
 *
 * Removes directory components (both separators), null bytes, control
 * characters and characters that are unsafe in HTTP headers, then bounds the
 * length while preserving the extension.
 */
export const sanitizeOriginalFilename = (originalName) => {
  if (typeof originalName !== 'string' || originalName.trim().length === 0) {
    return FALLBACK_FILENAME;
  }

  // Drop any directory component, whichever separator was used.
  const withoutPath = originalName.split(/[/\\]/).pop() ?? '';

  const cleaned = withoutPath
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["'<>|:*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return FALLBACK_FILENAME;
  }

  if (cleaned.length <= MAX_FILENAME_LENGTH) {
    return cleaned;
  }

  const extension = path.extname(cleaned);
  const baseName = path.basename(cleaned, extension);

  const truncatedBase = baseName.slice(0, Math.max(1, MAX_FILENAME_LENGTH - extension.length));

  return `${truncatedBase}${extension}`;
};

/**
 * Extract a lower-case extension only when it has a safe shape.
 *
 * Returns `''` for anything unusual (no extension, dots-only, overly long,
 * non-alphanumeric), which the upload filter then rejects.
 */
export const getSafeExtension = (filename) => {
  if (typeof filename !== 'string') {
    return '';
  }

  const extension = path.extname(filename).toLowerCase();

  return SAFE_EXTENSION_REGEX.test(extension) ? extension : '';
};

export { MAX_FILENAME_LENGTH };
