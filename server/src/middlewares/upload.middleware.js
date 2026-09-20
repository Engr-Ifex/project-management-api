import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';

import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getSafeExtension } from '../utils/filename.js';
import {
  CONTENT_MISMATCH_MESSAGE,
  isContentAllowedForMimeType,
  readFileHeader,
} from '../utils/fileSignature.js';
import { PUBLIC_AVATARS_DIR } from '../config/paths.js';

import {
  ALLOWED_MIME_TYPES_LABEL,
  ATTACHMENT_MAX_FILE_SIZE,
  ATTACHMENT_MAX_FILES_PER_REQUEST,
  isAllowedMimeType,
  isBlockedExtension,
  isExtensionAllowedForMimeType,
} from '../constants/attachment.js';

/*
 * Upload middleware.
 *
 * There are two consumers with different needs:
 *
 *   - Avatars  : public, image-only, small, written straight to disk and
 *                served by express.static. Behaviour is unchanged.
 *   - Attachments: private project files. These use memory storage so the
 *                attachment service can hand the buffer to the storage
 *                provider, which owns naming, scoping and persistence.
 *
 * Both share the same validation helpers so the rules cannot drift apart.
 */

/* ================================================================== *
 * Avatar upload (unchanged destination, filter and 5MB limit)
 * ================================================================== */

const AVATAR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Create the upload directory if it doesn't exist
const avatarUploadPath = PUBLIC_AVATARS_DIR;

if (!fs.existsSync(avatarUploadPath)) {
  fs.mkdirSync(avatarUploadPath, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarUploadPath);
  },

  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    const extension = path.extname(file.originalname);

    cb(null, `avatar-${uniqueSuffix}${extension}`);
  },
});

const avatarFileFilter = (req, file, cb) => {
  if (AVATAR_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(null, true);
  }

  /*
   * An ApiError (rather than a bare Error) makes this a 400 instead of a 500.
   * The message is unchanged so existing clients keep working.
   */
  cb(new ApiError(400, 'Only JPEG, JPG, PNG and WEBP images are allowed.'));
};

const upload = multer({
  storage: avatarStorage,

  limits: {
    fileSize: AVATAR_MAX_FILE_SIZE,
  },

  fileFilter: avatarFileFilter,
});

/** Remove a file multer has already written. A missing file is the desired state. */
const discardUploadedFile = async (filePath) => {
  if (!filePath) return;

  await fsp.unlink(filePath).catch(() => {});
};

/*
 * Avatar content check.
 *
 * `avatarFileFilter` can only see the MIME type the client declared, and multer
 * writes the file into the public avatars directory before anything can look at
 * it — so the bytes are read back here and compared with the image type the
 * file claims to be.
 *
 * This closes a real hole rather than a theoretical one: a file that is not an
 * image at all was stored, under its original extension, in a directory served
 * statically. An HTML document sent as `image/png` and named `.html` was
 * accepted and served.
 *
 * The file is already on disk by this point, so a rejection deletes it. Nothing
 * else has happened yet — no service call, no database write — so there is
 * nothing else to undo.
 */
export const validateAvatarContent = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  let header;

  try {
    header = await readFileHeader(req.file.path);
  } catch (error) {
    await discardUploadedFile(req.file.path);

    throw error;
  }

  if (!isContentAllowedForMimeType(header, req.file.mimetype)) {
    await discardUploadedFile(req.file.path);

    throw new ApiError(400, CONTENT_MISMATCH_MESSAGE);
  }

  return next();
});

/* ================================================================== *
 * Attachment upload
 * ================================================================== */

/**
 * Reject anything that is not an explicitly allowed, non-dangerous file.
 *
 * Three independent checks must pass:
 *   1. the declared MIME type is allow-listed
 *   2. the extension has a safe shape and is not on the blocked list
 *   3. the extension is one of the extensions mapped to that MIME type
 *
 * Together these stop disguised executables (`payload.exe` sent as
 * `image/png`), lying MIME types, and double-extension tricks.
 */
const attachmentFileFilter = (req, file, cb) => {
  const mimeType = (file.mimetype || '').toLowerCase();

  const extension = getSafeExtension(file.originalname);

  if (!isAllowedMimeType(mimeType)) {
    return cb(
      new ApiError(400, `Unsupported file type. Allowed types: ${ALLOWED_MIME_TYPES_LABEL}`)
    );
  }

  if (!extension) {
    return cb(new ApiError(400, 'File must have a valid extension'));
  }

  if (isBlockedExtension(extension)) {
    return cb(new ApiError(400, 'This file type is not allowed for security reasons'));
  }

  if (!isExtensionAllowedForMimeType(mimeType, extension)) {
    return cb(new ApiError(400, 'File extension does not match its declared file type'));
  }

  return cb(null, true);
};

/*
 * Memory storage: the buffer is validated and then persisted by the active
 * storage provider. Nothing is written to disk by multer itself, which keeps
 * all storage concerns behind the provider abstraction.
 */
const attachmentUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: ATTACHMENT_MAX_FILE_SIZE,
    files: ATTACHMENT_MAX_FILES_PER_REQUEST,
  },

  fileFilter: attachmentFileFilter,
});

export { attachmentUpload, AVATAR_MAX_FILE_SIZE, ATTACHMENT_MAX_FILE_SIZE };
export default upload;
