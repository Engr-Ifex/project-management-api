import { z } from 'zod';

import { OBJECT_ID_REGEX } from '../constants/regex.js';
import { ATTACHMENT_SCOPES } from '../constants/attachment.js';

const objectId = (field) => z.string().trim().regex(OBJECT_ID_REGEX, `${field} must be a valid ID`);

const projectParams = z.object({
  workspaceId: objectId('Workspace ID'),
  projectId: objectId('Project ID'),
});

const taskParams = projectParams.extend({
  taskId: objectId('Task ID'),
});

const commentParams = taskParams.extend({
  commentId: objectId('Comment ID'),
});

/*
 * Attachment metadata (task/comment) always comes from the URL, and the binary
 * arrives as multipart data that `express.json` does not parse. The upload
 * schemas therefore validate params only and accept an absent body.
 */
const emptyBody = z.object({}).optional();

const emptyQuery = z.object({}).optional();

const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  scope: z.enum(Object.values(ATTACHMENT_SCOPES)).optional(),
});

export const uploadProjectAttachmentSchema = z.object({
  body: emptyBody,
  params: projectParams,
  query: emptyQuery,
});

export const uploadTaskAttachmentSchema = z.object({
  body: emptyBody,
  params: taskParams,
  query: emptyQuery,
});

export const uploadCommentAttachmentSchema = z.object({
  body: emptyBody,
  params: commentParams,
  query: emptyQuery,
});

export const projectAttachmentsSchema = z.object({
  body: emptyBody,
  params: projectParams,
  query: listQuery.optional(),
});

export const taskAttachmentsSchema = z.object({
  body: emptyBody,
  params: taskParams,
  query: listQuery.optional(),
});

export const commentAttachmentsSchema = z.object({
  body: emptyBody,
  params: commentParams,
  query: listQuery.optional(),
});

export const attachmentIdSchema = z.object({
  body: emptyBody,
  params: projectParams.extend({
    attachmentId: objectId('Attachment ID'),
  }),
  query: emptyQuery,
});
