import { z } from 'zod';
import { OBJECT_ID_REGEX } from '../constants/regex.js';
import { NOTIFICATION_SORT_FIELDS } from '../constants/query.js';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';

import { booleanQuery, paginationQuery, sortQuery } from './query.validator.js';

const objectId = (field) => z.string().trim().regex(OBJECT_ID_REGEX, `${field} must be a valid ID`);

export const listNotificationsSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({}),

  query: paginationQuery
    .merge(sortQuery(NOTIFICATION_SORT_FIELDS))
    .extend({
      /*
       * Query values arrive as strings; map explicitly so that "false"
       * is not treated as truthy.
       */
      unread: booleanQuery('unread').optional(),

      type: z.enum(Object.values(NOTIFICATION_TYPES)).optional(),
    })
    .optional(),
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
