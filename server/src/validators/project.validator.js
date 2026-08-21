import { z } from 'zod';

const projectStatus = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];

const projectColor = z
  .string()
  .trim()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Color must be a valid hex color');

export const createProjectSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Project name must be at least 2 characters')
      .max(100, 'Project name cannot exceed 100 characters'),

    description: z
      .string()
      .trim()
      .max(2000, 'Project description cannot exceed 2000 characters')
      .optional()
      .default(''),

    deadline: z.string().datetime().optional().nullable(),

    color: projectColor.optional().nullable(),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),
  }),

  query: z.object({}).optional(),
});

export const updateProjectSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, 'Project name must be at least 2 characters')
        .max(100, 'Project name cannot exceed 100 characters')
        .optional(),

      description: z
        .string()
        .trim()
        .max(2000, 'Project description cannot exceed 2000 characters')
        .optional(),

      deadline: z.string().datetime().nullable().optional(),

      color: projectColor.nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),
  }),

  query: z.object({}).optional(),
});

export const projectIdSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),
  }),

  query: z.object({}).optional(),
});

export const updateProjectStatusSchema = z.object({
  body: z.object({
    status: z.enum(projectStatus, 'Invalid project status'),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),
  }),

  query: z.object({}).optional(),
});

export const addProjectMemberSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),
  }),

  query: z.object({}).optional(),
});

export const removeProjectMemberSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),

    userId: z.string().min(1, 'User ID is required'),
  }),

  query: z.object({}).optional(),
});
