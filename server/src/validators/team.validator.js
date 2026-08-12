import { z } from 'zod';

export const inviteMemberSchema = z.object({
  body: z.object({
    email: z.string().trim().email('Invalid email address'),

    role: z.enum(['admin', 'member']).default('member'),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),
  }),

  query: z.object({}).optional(),
});

export const removeMemberSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    userId: z.string().min(1, 'User ID is required'),
  }),

  query: z.object({}).optional(),
});

export const updateMemberRoleSchema = z.object({
  body: z.object({
    role: z.enum(['admin', 'member']),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    userId: z.string().min(1, 'User ID is required'),
  }),

  query: z.object({}).optional(),
});
