import { z } from 'zod';

import { WORKSPACE_SORT_FIELDS } from '../constants/query.js';

import { booleanQuery, paginationQuery, searchQuery, sortQuery } from './query.validator.js';

/*
 * Workspace list query for the caller's own workspaces.
 *
 * `isArchived` defaults to `false` in the service, so omitting it preserves the
 * original behaviour — live workspaces only. It is needed because an archived
 * workspace is invisible to every other read (`GET /workspaces/:id` answers 404
 * by design), so without this filter a workspace could be archived and then
 * never found again, making `PATCH …/restore` unreachable.
 */
export const workspaceListSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({}),

  query: paginationQuery
    .merge(sortQuery(WORKSPACE_SORT_FIELDS))
    .merge(searchQuery)
    .extend({
      isArchived: booleanQuery('isArchived').optional(),
    })
    .optional(),
});

export const createWorkspaceSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, 'Workspace name must be at least 2 characters')
        .max(100, 'Workspace name cannot exceed 100 characters'),

      description: z
        .string()
        .trim()
        .max(500, 'Workspace description cannot exceed 500 characters')
        .optional(),
    })
    .strict(),

  params: z.object({}),
  query: z.object({}),
});

export const updateWorkspaceSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, 'Workspace name must be at least 2 characters')
        .max(100, 'Workspace name cannot exceed 100 characters')
        .optional(),

      description: z
        .string()
        .trim()
        .max(500, 'Workspace description cannot exceed 500 characters')
        .optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),
  }),

  query: z.object({}).optional(),
});

export const workspaceIdSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),
  }),

  query: z.object({}).optional(),
});
