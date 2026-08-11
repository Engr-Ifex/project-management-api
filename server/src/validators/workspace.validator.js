import { z } from 'zod';

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

  query: z.object({}),
});
