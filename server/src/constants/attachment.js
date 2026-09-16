/*
 * Attachment policy: what may be uploaded, how large, and how a MIME type
 * maps to an on-disk extension.
 *
 * The allow-list is deliberately explicit. Anything not listed here is
 * rejected, which keeps executable/script/markup formats out by default
 * rather than trying to enumerate every dangerous type.
 */

export const ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// One file per upload request keeps the API and error handling predictable.
export const ATTACHMENT_MAX_FILES_PER_REQUEST = 1;

export const ATTACHMENT_SCOPES = Object.freeze({
  PROJECT: 'project',
  TASK: 'task',
  COMMENT: 'comment',
});

/*
 * Allowed MIME types -> the extensions that MIME type may legitimately use.
 *
 * A file must satisfy BOTH checks: its declared MIME type must be allow-listed
 * AND its extension must be one of the extensions mapped to that MIME type.
 * This blocks a renamed executable (`payload.exe` sent as `image/png`) as well
 * as a lying MIME type on an otherwise permitted extension.
 */
export const MIME_TYPE_EXTENSIONS = Object.freeze({
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],

  'application/pdf': ['.pdf'],

  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md'],

  'application/json': ['.json'],

  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],

  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],

  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],

  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
});

export const ALLOWED_MIME_TYPES = Object.freeze(Object.keys(MIME_TYPE_EXTENSIONS));

/*
 * Second line of defence: extensions that are never accepted, even if a MIME
 * type above were somehow matched. Executables, installers, server-side
 * scripts and active markup (which can execute in a browser context).
 */
export const BLOCKED_EXTENSIONS = Object.freeze([
  // Executables / installers / libraries
  '.exe',
  '.dll',
  '.com',
  '.scr',
  '.msi',
  '.cpl',
  '.bin',
  '.so',
  '.dylib',
  '.app',
  '.apk',
  '.dmg',
  '.deb',
  '.rpm',
  '.jar',

  // Shell / OS scripts
  '.bat',
  '.cmd',
  '.sh',
  '.bash',
  '.zsh',
  '.ksh',
  '.ps1',
  '.psm1',
  '.vbs',
  '.vbe',
  '.wsf',
  '.wsh',
  '.hta',
  '.run',

  // Server-side / runtime scripts
  '.php',
  '.phtml',
  '.jsp',
  '.jspx',
  '.asp',
  '.aspx',
  '.cgi',
  '.pl',
  '.py',
  '.rb',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',

  // Active markup (XSS / XXE vectors)
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.xml',
  '.xsl',
  '.swf',
]);

/**
 * Whether a MIME type is accepted at all.
 */
export const isAllowedMimeType = (mimeType) =>
  typeof mimeType === 'string' && ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());

/**
 * Whether an extension (lower-case, with leading dot) is explicitly blocked.
 */
export const isBlockedExtension = (extension) =>
  typeof extension === 'string' && BLOCKED_EXTENSIONS.includes(extension.toLowerCase());

/**
 * Whether the extension is one of the extensions mapped to the given MIME type.
 */
export const isExtensionAllowedForMimeType = (mimeType, extension) => {
  if (typeof mimeType !== 'string' || typeof extension !== 'string') {
    return false;
  }

  const allowedExtensions = MIME_TYPE_EXTENSIONS[mimeType.toLowerCase()];

  return Array.isArray(allowedExtensions) && allowedExtensions.includes(extension.toLowerCase());
};

export const ALLOWED_MIME_TYPES_LABEL =
  'images, PDF, text, CSV, Markdown, JSON, Office documents and ZIP archives';
