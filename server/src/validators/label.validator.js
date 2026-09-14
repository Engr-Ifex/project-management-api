import { z } from 'zod';
import { HEX_COLOR_REGEX, OBJECT_ID_REGEX } from '../constants/regex.js';

const objectId = (field) => z.string().trim().regex(OBJECT_ID_REGEX, `${field} must be a valid ID`);

const labelName = z
  .string()
  .trim()
  .min(1, 'Label name cannot be empty')
  .max(50, 'Label name cannot exceed 50 characters');

const labelColor = z.string().trim().regex(HEX_COLOR_REGEX, 'Color must be a valid hex color');

const projectParams = z.object({
  workspaceId: objectId('Workspace ID'),
  projectId: objectId('Project ID'),
});

const taskParams = projectParams.extend({
  taskId: objectId('Task ID'),
});

export const createLabelSchema = z.object({
  body: z.object({
    name: labelName,
    color: labelColor,
  }),

  params: projectParams,

  query: z.object({}).optional(),
});

export const updateLabelSchema = z.object({
  body: z
    .object({
      name: labelName.optional(),
      color: labelColor.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),

  params: projectParams.extend({
    labelId: objectId('Label ID'),
  }),

  query: z.object({}).optional(),
});

export const projectLabelsSchema = z.object({
  body: z.object({}).optional(),

  params: projectParams,

  query: z.object({}).optional(),
});

export const labelIdSchema = z.object({
  body: z.object({}).optional(),

  params: projectParams.extend({
    labelId: objectId('Label ID'),
  }),

  query: z.object({}).optional(),
});

export const assignLabelSchema = z.object({
  body: z.object({
    labelId: objectId('Label ID'),
  }),

  params: taskParams,

  query: z.object({}).optional(),
});

export const removeLabelSchema = z.object({
  body: z.object({}).optional(),

  params: taskParams.extend({
    labelId: objectId('Label ID'),
  }),

  query: z.object({}).optional(),
});
