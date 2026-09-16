import { z } from 'zod';

import { OBJECT_ID_REGEX } from '../constants/regex.js';
import { MAX_UPCOMING_DUE_DAYS } from '../constants/dashboard.js';

const objectId = (field) => z.string().trim().regex(OBJECT_ID_REGEX, `${field} must be a valid ID`);

/*
 * Width of the "due soon" window, in days.
 *
 * Coerced from the query string, and bounded so a client cannot ask for an
 * unbounded window that would overlap `overdue` or scan an unbounded date
 * range. `.optional()` is applied outside the coercion so an absent parameter
 * stays undefined rather than becoming NaN.
 */
const upcomingDueDays = z.coerce
  .number()
  .int('upcomingDueDays must be a whole number')
  .min(1, 'upcomingDueDays must be at least 1')
  .max(MAX_UPCOMING_DUE_DAYS, `upcomingDueDays cannot exceed ${MAX_UPCOMING_DUE_DAYS}`)
  .optional();

const emptyBody = z.object({}).optional();

export const workspaceDashboardSchema = z.object({
  body: emptyBody,

  params: z.object({
    workspaceId: objectId('Workspace ID'),
  }),

  query: z.object({}).optional(),
});

export const projectDashboardSchema = z.object({
  body: emptyBody,

  params: z.object({
    workspaceId: objectId('Workspace ID'),
    projectId: objectId('Project ID'),
  }),

  query: z
    .object({
      upcomingDueDays,
    })
    .optional(),
});
