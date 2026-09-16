import { z } from 'zod';
import { OBJECT_ID_REGEX } from '../constants/regex.js';
import { COMMENT_SORT_FIELDS } from '../constants/query.js';

import { paginationQuery, searchQuery, sortQuery } from './query.validator.js';

const objectId = (field) => z.string().trim().regex(OBJECT_ID_REGEX, `${field} must be a valid ID`);

const commentContent = z
  .string()
  .trim()
  .min(1, 'Comment cannot be empty')
  .max(2000, 'Comment cannot exceed 2000 characters');

const taskCommentParams = z.object({
  workspaceId: objectId('Workspace ID'),
  projectId: objectId('Project ID'),
  taskId: objectId('Task ID'),
});

export const createTaskCommentSchema = z.object({
  body: z.object({
    content: commentContent,
  }),

  params: taskCommentParams,

  query: z.object({}).optional(),
});

export const updateTaskCommentSchema = z.object({
  body: z.object({
    content: commentContent,
  }),

  params: taskCommentParams.extend({
    commentId: objectId('Comment ID'),
  }),

  query: z.object({}).optional(),
});

export const taskCommentIdSchema = z.object({
  body: z.object({}).optional(),

  params: taskCommentParams.extend({
    commentId: objectId('Comment ID'),
  }),

  query: z.object({}).optional(),
});

export const getTaskCommentsSchema = z.object({
  body: z.object({}).optional(),

  params: taskCommentParams,

  query: paginationQuery.merge(sortQuery(COMMENT_SORT_FIELDS)).merge(searchQuery).optional(),
});
