/*
 * Upload limits.
 *
 * These mirror the server's rules, and they exist client-side only so a user is
 * not handed a 400 for a file that could have been refused instantly. **They are
 * not the authority.** The server checks the declared MIME type, the extension
 * *and* the file's magic bytes, so a renamed file passes every check here and is
 * still rejected there. That is the correct division: the client filters the
 * obvious mistakes, the server enforces the rule.
 *
 * If the server's allow-list changes, these must change with it.
 */

/** Attachments: 10 MB, one file per request. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Avatars: 5 MB, and images only. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Accepted attachment extensions.
 *
 * Deliberately excludes HTML, XML and SVG: those are active markup, and serving
 * them from the API's origin would be a scripting vector. The server refuses
 * them, so offering them here would only produce a confusing failure.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'gif',
  'pdf', 'txt', 'csv', 'md', 'json',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip',
] as const;
