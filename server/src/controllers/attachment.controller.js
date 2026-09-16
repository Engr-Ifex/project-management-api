import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import * as attachmentService from '../services/attachment.service.js';

import { hasPermission } from '../constants/rolePermissions.js';
import { WORKSPACE_PERMISSIONS } from '../constants/workspacePermissions.js';

/**
 * Build an RFC 6266 / RFC 5987 compliant Content-Disposition value.
 *
 * A plain ASCII fallback is supplied for older clients, and the full UTF-8
 * name via `filename*`. The value always uses `attachment` (never `inline`),
 * so a stored file is downloaded rather than rendered in the browser context.
 */
const buildContentDisposition = (filename) => {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');

  const encoded = encodeURIComponent(filename);

  return `attachment; filename="${asciiFallback || 'download'}"; filename*=UTF-8''${encoded}`;
};

export const uploadProjectAttachment = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.uploadAttachment({
    workspaceId: req.params.workspaceId,
    projectId: req.params.projectId,
    userId: req.user._id,
    file: req.file,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, 'Attachment uploaded successfully', { attachment }));
});

export const uploadTaskAttachment = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.uploadAttachment({
    workspaceId: req.params.workspaceId,
    projectId: req.params.projectId,
    taskId: req.params.taskId,
    userId: req.user._id,
    file: req.file,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, 'Attachment uploaded successfully', { attachment }));
});

export const uploadCommentAttachment = asyncHandler(async (req, res) => {
  const attachment = await attachmentService.uploadAttachment({
    workspaceId: req.params.workspaceId,
    projectId: req.params.projectId,
    taskId: req.params.taskId,
    commentId: req.params.commentId,
    userId: req.user._id,
    file: req.file,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, 'Attachment uploaded successfully', { attachment }));
});

export const getProjectAttachments = asyncHandler(async (req, res) => {
  const result = await attachmentService.getProjectAttachments(
    req.params.workspaceId,
    req.params.projectId,
    req.validatedQuery ?? {}
  );

  return res.status(200).json(new ApiResponse(200, 'Attachments retrieved successfully', result));
});

export const getTaskAttachments = asyncHandler(async (req, res) => {
  const result = await attachmentService.getTaskAttachments(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.validatedQuery ?? {}
  );

  return res.status(200).json(new ApiResponse(200, 'Attachments retrieved successfully', result));
});

export const getCommentAttachments = asyncHandler(async (req, res) => {
  const result = await attachmentService.getCommentAttachments(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.params.commentId,
    req.validatedQuery ?? {}
  );

  return res.status(200).json(new ApiResponse(200, 'Attachments retrieved successfully', result));
});

export const downloadAttachment = asyncHandler(async (req, res, next) => {
  const { attachment, stream } = await attachmentService.getAttachmentForDownload(
    req.params.workspaceId,
    req.params.projectId,
    req.params.attachmentId
  );

  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Length', attachment.size);
  res.setHeader('Content-Disposition', buildContentDisposition(attachment.originalFilename));

  // Never let a browser sniff the payload into something executable.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Private project data must not sit in shared caches.
  res.setHeader('Cache-Control', 'private, no-store');

  /*
   * A read error can happen mid-stream, after headers have been sent, so it
   * cannot be funnelled through asyncHandler. Destroy the response in that
   * case; otherwise hand the error to the normal error middleware.
   */
  stream.on('error', (error) => {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    next(error);
  });

  return stream.pipe(res);
});

export const deleteAttachment = asyncHandler(async (req, res) => {
  /*
   * Workspace owners/admins hold elevated authority over projects in their
   * workspace (same rule applied by requireProjectPermission). They are the
   * only callers besides the uploader allowed to delete an attachment.
   */
  const isWorkspaceElevated = hasPermission(
    req.workspaceMember.role,
    WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE
  );

  await attachmentService.deleteAttachment(
    req.params.workspaceId,
    req.params.projectId,
    req.params.attachmentId,
    req.user._id,
    isWorkspaceElevated
  );

  return res.status(200).json(new ApiResponse(200, 'Attachment deleted successfully'));
});
