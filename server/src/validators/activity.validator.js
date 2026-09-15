import { z } from 'zod';
import { OBJECT_ID_REGEX } from '../constants/regex.js';

const objectId = (field) => z.string().trim().regex(OBJECT_ID_REGEX, `${field} must be a valid ID`);

const paginationFields = {
  page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional(),
};

export const projectActivitiesSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: objectId('Workspace ID'),
    projectId: objectId('Project ID'),
  }),

  query: z.object({ ...paginationFields }),
});

export const taskActivitiesSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: objectId('Workspace ID'),
    projectId: objectId('Project ID'),
    taskId: objectId('Task ID'),
  }),

  query: z.object({ ...paginationFields }),
});
