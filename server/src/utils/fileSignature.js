import fsp from 'fs/promises';

import ApiError from './ApiError.js';

/*
 * Content-based file type detection.
 *
 * The upload pipeline checks a declared MIME type and a filename extension, and
 * both are supplied by the client. A renamed executable sent as `image/png`
 * with a `.png` name satisfies both, so those checks alone cannot tell what a
 * file actually is. This module reads the bytes.
 *
 * It is a complement, not a replacement: the MIME allow-list, the extension
 * map, the blocked-extension list and the size limits all still apply. This
 * only adds "and the content must really be that type".
 *
 * WHAT IT CANNOT DO. Text formats — `text/plain`, `text/csv`, `text/markdown`,
 * `application/json` — have no magic number, and pretending otherwise would be
 * worse than admitting it. For those the check is that the content is plausibly
 * text at all: no NUL bytes and no control characters other than tab, newline
 * and carriage return. That rejects a binary renamed to `.txt`; it does not
 * and cannot prove the text is benign. The protection for those formats is the
 * existing policy, which refuses the dangerous ones outright — `.svg`, `.html`,
 * `.xml` and `.js` are on the blocked list, so no active markup reaches the
 * store.
 *
 * This is not malware scanning. A valid PNG can still contain anything in its
 * pixels, and nothing here inspects a file's payload.
 */

/** How many leading bytes are examined. Enough for every signature below. */
const SAMPLE_BYTES = 4096;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/* OLE2 compound file: the legacy Word/Excel/PowerPoint container. */
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/* The ZIP local-file, empty-archive and spanned markers. */
const ZIP_MARKERS = [0x03, 0x04, 0x05, 0x06, 0x07, 0x08];

const startsWithBytes = (buffer, bytes) =>
  buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

const startsWithAscii = (buffer, text, offset = 0) => {
  if (buffer.length < offset + text.length) return false;

  for (let index = 0; index < text.length; index += 1) {
    if (buffer[offset + index] !== text.charCodeAt(index)) return false;
  }

  return true;
};

const isZip = (buffer) =>
  startsWithAscii(buffer, 'PK') &&
  buffer.length >= 4 &&
  ZIP_MARKERS.includes(buffer[2]) &&
  ZIP_MARKERS.includes(buffer[3]);

/** Tab, newline and carriage return are the only control characters text uses. */
const TEXT_CONTROL_BYTES = new Set([0x09, 0x0a, 0x0d]);

const isProbablyText = (buffer) => {
  for (const byte of buffer) {
    if (byte < 0x20 && !TEXT_CONTROL_BYTES.has(byte)) return false;
  }

  return true;
};

/**
 * The content family a buffer actually is, or `null` if it is none of them.
 *
 * Returns a family rather than a MIME type because several MIME types share a
 * container: `.docx`, `.xlsx`, `.pptx` and `.zip` are all ZIP archives, and
 * `.doc`, `.xls` and `.ppt` are all OLE2. Which of those a file claims to be
 * is decided by its declared type — see `CONTENT_FOR_MIME_TYPE`.
 */
export const detectContentType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  if (startsWithBytes(buffer, PNG_SIGNATURE)) return 'png';
  if (startsWithBytes(buffer, JPEG_SIGNATURE)) return 'jpeg';
  if (startsWithAscii(buffer, 'GIF87a') || startsWithAscii(buffer, 'GIF89a')) return 'gif';
  if (startsWithAscii(buffer, 'RIFF') && startsWithAscii(buffer, 'WEBP', 8)) return 'webp';
  if (startsWithAscii(buffer, '%PDF-')) return 'pdf';
  if (startsWithBytes(buffer, OLE2_SIGNATURE)) return 'ole2';
  if (isZip(buffer)) return 'zip';

  return isProbablyText(buffer) ? 'text' : null;
};

/**
 * Which content families each allowed MIME type may legitimately have.
 *
 * Every entry in `MIME_TYPE_EXTENSIONS` must appear here — a test enforces it,
 * so adding an allowed type without deciding what its content looks like fails
 * the suite rather than silently skipping the check.
 */
export const CONTENT_FOR_MIME_TYPE = Object.freeze({
  'image/jpeg': ['jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],

  'application/pdf': ['pdf'],

  /* The OOXML formats are ZIP containers. */
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['zip'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['zip'],
  'application/zip': ['zip'],
  'application/x-zip-compressed': ['zip'],

  /* The legacy Office formats are OLE2 compound files. */
  'application/msword': ['ole2'],
  'application/vnd.ms-excel': ['ole2'],
  'application/vnd.ms-powerpoint': ['ole2'],

  /*
   * No magic number. The check is "plausibly text", which is a weaker claim and
   * is documented as such — see the note at the top of this file.
   */
  'text/plain': ['text'],
  'text/csv': ['text'],
  'text/markdown': ['text'],
  'application/json': ['text'],
});

/** Every allowed MIME type has a declared content expectation. */
export const MIME_TYPES_WITH_CONTENT_RULES = Object.freeze(Object.keys(CONTENT_FOR_MIME_TYPE));

/** MIME types whose content is checked by signature rather than by "is text". */
export const SIGNATURE_VALIDATED_MIME_TYPES = Object.freeze(
  MIME_TYPES_WITH_CONTENT_RULES.filter((mimeType) => CONTENT_FOR_MIME_TYPE[mimeType][0] !== 'text')
);

export const CONTENT_MISMATCH_MESSAGE =
  'File content does not match its declared type. The file may have been renamed.';

/**
 * Whether a buffer's content is acceptable for the MIME type it claims.
 *
 * A MIME type with no entry here is refused: an unknown type has no content
 * expectation, and guessing would defeat the check.
 */
export const isContentAllowedForMimeType = (buffer, mimeType) => {
  if (typeof mimeType !== 'string') return false;

  const expected = CONTENT_FOR_MIME_TYPE[mimeType.toLowerCase()];

  if (!Array.isArray(expected)) return false;

  const detected = detectContentType(buffer);

  return detected !== null && expected.includes(detected);
};

/**
 * Read the leading bytes of a file from disk.
 *
 * The avatar upload writes to disk before anything can inspect it, so its
 * content has to be read back. Only the header is read — a signature lives in
 * the first few bytes and there is no reason to pull a 5MB image into memory.
 */
export const readFileHeader = async (filePath, length = SAMPLE_BYTES) => {
  const handle = await fsp.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);

    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/**
 * Assert that a buffer's content matches the type it claims, or fail with 400.
 */
export const assertContentMatchesType = (buffer, mimeType) => {
  if (!isContentAllowedForMimeType(buffer, mimeType)) {
    throw new ApiError(400, CONTENT_MISMATCH_MESSAGE);
  }
};

export { SAMPLE_BYTES };
export default detectContentType;
