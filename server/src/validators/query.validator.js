import { z } from 'zod';

import { OBJECT_ID_REGEX } from '../constants/regex.js';
import { SORT_ORDERS } from '../constants/query.js';

/*
 * Shared query-parameter building blocks.
 *
 * Every list endpoint composes its query schema from these, which is what
 * makes `page`, `limit`, `sortBy`, `order` and `search` behave identically
 * everywhere.
 *
 * These schemas are also the injection boundary: each parameter is constrained
 * to a primitive (enum, integer, boolean, bounded string, coerced date), so a
 * value that looks like an operator — or an object — is rejected with a 400
 * before it can reach a query.
 */

export const paginationQuery = z.object({
  page: z.coerce
    .number()
    .int('page must be a whole number')
    .positive('page must be at least 1')
    .optional(),

  limit: z.coerce
    .number()
    .int('limit must be a whole number')
    .positive('limit must be at least 1')
    .max(100, 'limit cannot exceed 100')
    .optional(),
});

export const sortQuery = (sortFields) =>
  z.object({
    sortBy: z
      .enum([...sortFields], {
        message: `sortBy must be one of: ${sortFields.join(', ')}`,
      })
      .optional(),

    order: z.enum([...SORT_ORDERS], { message: 'order must be asc or desc' }).optional(),
  });

export const searchQuery = z.object({
  search: z
    .string()
    .trim()
    .min(1, 'search cannot be empty')
    .max(100, 'search cannot exceed 100 characters')
    .optional(),
});

/**
 * A boolean query parameter. Only the literal strings `true` / `false` are
 * accepted, matching the existing notification `unread` parameter.
 */
export const booleanQuery = (field) =>
  z
    .enum(['true', 'false'], { message: `${field} must be true or false` })
    .transform((value) => value === 'true');

export const objectIdQuery = (field) =>
  z.string().trim().regex(OBJECT_ID_REGEX, `${field} must be a valid ID`);

export const dateQuery = (field) => z.coerce.date({ message: `${field} must be a valid date` });
