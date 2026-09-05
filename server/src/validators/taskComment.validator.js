import { z } from 'zod';

export const createTaskCommentSchema = z.object({
  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, 'Comment cannot be empty')
      .max(
        2000,
        'Comment cannot exceed 2000 characters'
      ),
  }),

  params: z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    taskId: z.string().min(1),
  }),

  query: z.object({}).optional(),
});

export const updateTaskCommentSchema = z.object({
  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, 'Comment cannot be empty')
      .max(
        2000,
        'Comment cannot exceed 2000 characters'
      ),
  }),

  params: z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    taskId: z.string().min(1),
    commentId: z.string().min(1),
  }),

  query: z.object({}).optional(),
});

export const taskCommentIdSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    taskId: z.string().min(1),
    commentId: z.string().min(1),
  }),

  query: z.object({}).optional(),
});

export const getTaskCommentsSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    taskId: z.string().min(1),
  }),

  query: z.object({}).optional(),
});