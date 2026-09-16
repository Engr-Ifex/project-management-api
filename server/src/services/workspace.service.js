import Workspace from '../models/Workspace.js';
import ApiError from '../utils/ApiError.js';

import { buildSearchFilter, buildSort, findPaginated, mergeFilters } from '../utils/query.js';

import {
  WORKSPACE_DEFAULT_SORT,
  WORKSPACE_SEARCH_FIELDS,
  WORKSPACE_SORT_FIELDS,
} from '../constants/query.js';

export const createWorkspace = async (userId, workspaceData) => {
  const { name, description } = workspaceData;

  const workspace = await Workspace.create({
    name,
    description,
    owner: userId,

    members: [
      {
        user: userId,
        role: 'owner',
      },
    ],
  });

  return workspace;
};

export const getUserWorkspaces = async (userId, query = {}) => {
  /*
   * Same scope the model's `findActiveByMember` helper applies: workspaces the
   * caller belongs to, excluding archived ones. Written out explicitly here
   * because the filter is combined with the optional search clause.
   */
  const filter = mergeFilters(
    {
      'members.user': userId,
      isArchived: false,
    },
    buildSearchFilter(query.search, WORKSPACE_SEARCH_FIELDS)
  );

  const sort = buildSort(query, WORKSPACE_SORT_FIELDS, WORKSPACE_DEFAULT_SORT);

  const { items, pagination } = await findPaginated(Workspace, { filter, sort, query });

  return { workspaces: items, pagination };
};

export const getWorkspaceById = async (workspace) => {
  return workspace;
};

export const updateWorkspace = async (workspace, workspaceData) => {
  const { name, description } = workspaceData;

  if (name !== undefined) {
    workspace.name = name;
  }

  if (description !== undefined) {
    workspace.description = description;
  }

  await workspace.save();

  return workspace;
};

export const archiveWorkspace = async (workspace) => {
  workspace.isArchived = true;
  workspace.archivedAt = new Date();

  await workspace.save();

  return workspace;
};

export const restoreWorkspace = async (workspace) => {
  workspace.isArchived = false;
  workspace.archivedAt = null;

  await workspace.save();

  return workspace;
};

export const deleteWorkspace = async (workspace) => {
  await workspace.deleteOne();
};

const workspaceService = {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  archiveWorkspace,
  restoreWorkspace,
  deleteWorkspace,
};

export default workspaceService;
