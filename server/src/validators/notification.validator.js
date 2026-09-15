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

export const listNotificationsSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({}),

  query: z.object({
    ...paginationFields,

    /*
     * Query values arrive as strings; map explicitly so that "false"
     * is not treated as truthy.
     */
    unread: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  }),
});

export const notificationIdSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    notificationId: objectId('Notification ID'),
  }),

  query: z.object({}).optional(),
});

export const emptyRequestSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({}),

  query: z.object({}).optional(),
});
