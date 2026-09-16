import { Router } from 'express';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requireWorkspaceMember } from '../middlewares/workspace.middleware.js';
import requireProjectPermission from '../middlewares/requireProjectPermission.middleware.js';
import { attachmentUpload } from '../middlewares/upload.middleware.js';

import * as attachmentController from '../controllers/attachment.controller.js';

import {
  uploadProjectAttachmentSchema,
  uploadTaskAttachmentSchema,
  uploadCommentAttachmentSchema,
  projectAttachmentsSchema,
  taskAttachmentsSchema,
  commentAttachmentsSchema,
  attachmentIdSchema,
} from '../validators/attachment.validator.js';

const router = Router();

/*
 * Files arrive as multipart/form-data under the field name `file`.
 *
 * The upload middleware deliberately runs *after* the authorization checks so
 * an unauthorized caller is rejected before any bytes are buffered in memory.
 */

// Project-level attachments
router.post(
  '/:workspaceId/projects/:projectId/attachments',
  authenticate,
  validate(uploadProjectAttachmentSchema),
  requireWorkspaceMember,
  requireProjectPermission('attachment:create'),
  attachmentUpload.single('file'),
  attachmentController.uploadProjectAttachment
);

router.get(
  '/:workspaceId/projects/:projectId/attachments',
  authenticate,
  validate(projectAttachmentsSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  attachmentController.getProjectAttachments
);

// Task attachments
router.post(
  '/:workspaceId/projects/:projectId/tasks/:taskId/attachments',
  authenticate,
  validate(uploadTaskAttachmentSchema),
  requireWorkspaceMember,
  requireProjectPermission('attachment:create'),
  attachmentUpload.single('file'),
  attachmentController.uploadTaskAttachment
);

router.get(
  '/:workspaceId/projects/:projectId/tasks/:taskId/attachments',
  authenticate,
  validate(taskAttachmentsSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  attachmentController.getTaskAttachments
);

// Comment attachments
router.post(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId/attachments',
  authenticate,
  validate(uploadCommentAttachmentSchema),
  requireWorkspaceMember,
  requireProjectPermission('attachment:create'),
  attachmentUpload.single('file'),
  attachmentController.uploadCommentAttachment
);

router.get(
  '/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId/attachments',
  authenticate,
  validate(commentAttachmentsSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  attachmentController.getCommentAttachments
);

// Download + delete (project scoped)
router.get(
  '/:workspaceId/projects/:projectId/attachments/:attachmentId/download',
  authenticate,
  validate(attachmentIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('project:view'),
  attachmentController.downloadAttachment
);

router.delete(
  '/:workspaceId/projects/:projectId/attachments/:attachmentId',
  authenticate,
  validate(attachmentIdSchema),
  requireWorkspaceMember,
  requireProjectPermission('attachment:delete'),
  attachmentController.deleteAttachment
);

export default router;
