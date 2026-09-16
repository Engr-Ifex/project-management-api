import { z } from 'zod';

import { OBJECT_ID_REGEX } from '../constants/regex.js';
import { ACTIVITY_SORT_FIELDS } from '../constants/query.js';

import ProjectActivity from '../models/ProjectActivity.js';

import { paginationQuery, sortQuery } from './query.validator.js';

const objectId = (field) => z.string().trim().regex(OBJECT_ID_REGEX, `${field} must be a valid ID`);

/*
 * The action filter is built from the model's own enum, so the accepted values
 * cannot drift away from the actions the API is able to record.
 */
const ACTIVITY_ACTIONS = ProjectActivity.schema.path('action').enumValues;

const activityQuery = paginationQuery
  .merge(sortQuery(ACTIVITY_SORT_FIELDS))
  .extend({
    action: z
      .enum([...ACTIVITY_ACTIONS], { message: 'action is not a recognised activity action' })
      .optional(),
  })
  .optional();

export const projectActivitiesSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: objectId('Workspace ID'),
    projectId: objectId('Project ID'),
  }),

  query: activityQuery,
});

export const taskActivitiesSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: objectId('Workspace ID'),
    projectId: objectId('Project ID'),
    taskId: objectId('Task ID'),
  }),

  query: activityQuery,
});
