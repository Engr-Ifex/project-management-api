import Project from '../models/Project.js';
import Workspace from '../models/Workspace.js';
import ApiError from '../utils/ApiError.js';
import { createProjectActivity } from './projectActivity.service.js';
import { notifyProjectMemberAdded, notifyProjectRoleChanged } from './notification.service.js';
import PROJECT_ROLES from '../constants/projectRoles.js';

import {
  buildDateRange,
  buildSearchFilter,
  buildSort,
  findPaginated,
  mergeFilters,
} from '../utils/query.js';

import {
  PROJECT_DEFAULT_SORT,
  PROJECT_SEARCH_FIELDS,
  PROJECT_SORT_FIELDS,
} from '../constants/query.js';

/*
 * Member visibility on the two reads a plain workspace member can reach.
 *
 * A workspace member who holds no project role may discover a project — the
 * list and the project record are readable with workspace membership alone.
 * Discovery does not extend to the people on it: `members` carries names,
 * email addresses and avatars, and the array itself is project-internal
 * membership data. Returning it meant any workspace member could enumerate
 * every project's membership, including addresses, without being on any of
 * them.
 *
 * The caller keeps the full response when they are on the project, or when
 * they are a workspace owner/admin — Policy A, read from `hasProjectOverride`
 * via the controller so this cannot drift from the guard.
 */
const canSeeProjectMembers = (project, viewer) => {
  if (viewer?.isWorkspaceElevated) return true;

  if (!viewer?.userId) return false;

  return project.members.some(
    (member) => String(member.user?._id ?? member.user) === String(viewer.userId)
  );
};

/*
 * Reduce a project to what a caller without project access may see.
 *
 * `members` is dropped rather than trimmed: the identities, the roles and the
 * join dates are all membership data, and a caller who is not on the project
 * has no use for any of it. `createdBy` is kept as a plain reference — an id
 * identifies nobody without the user record, and keeping the field means the
 * response keeps its shape for clients that read it.
 */
const shapeProjectForViewer = (project, viewer) => {
  if (canSeeProjectMembers(project, viewer)) return project;

  const shaped = typeof project.toObject === 'function' ? project.toObject() : { ...project };

  delete shaped.members;

  if (shaped.createdBy && typeof shaped.createdBy === 'object') {
    shaped.createdBy = shaped.createdBy._id;
  }

  return shaped;
};

export const createProject = async (workspaceId, userId, projectData) => {
  const project = await Project.create({
    workspace: workspaceId,
    createdBy: userId,
    ...projectData,
    members: [
      {
        user: userId,
        role: PROJECT_ROLES.OWNER,
      },
    ],
  });

  await createProjectActivity({
    workspaceId,
    projectId: project._id,
    userId,
    action: 'created',
  });

  return project;
};

export const getWorkspaceProjects = async (workspaceId, query = {}, viewer = null) => {
  const deadlineRange = buildDateRange(query.deadlineFrom, query.deadlineTo);

  const filter = mergeFilters(
    {
      workspace: workspaceId,
      /*
       * Archived projects stay excluded unless explicitly requested, which is
       * the behaviour this endpoint has always had.
       */
      isArchived: query.isArchived ?? false,
    },
    query.status ? { status: query.status } : null,
    deadlineRange ? { deadline: deadlineRange } : null,
    buildSearchFilter(query.search, PROJECT_SEARCH_FIELDS)
  );

  const sort = buildSort(query, PROJECT_SORT_FIELDS, PROJECT_DEFAULT_SORT);

  const { items, pagination } = await findPaginated(Project, {
    filter,
    sort,
    query,
    populate: [
      { path: 'createdBy', select: 'name email' },
      { path: 'members.user', select: 'name email avatar' },
    ],
  });

  return {
    projects: items.map((project) => shapeProjectForViewer(project, viewer)),
    pagination,
  };
};

export const getProjectById = async (workspaceId, projectId, viewer = null) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
  })
    .populate('createdBy', 'name email avatar')
    .populate('members.user', 'name email avatar');

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  return shapeProjectForViewer(project, viewer);
};

export const updateProject = async (workspaceId, projectId, updateData, userId) => {
  const changedFields = Object.keys(updateData);

  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      workspace: workspaceId,
      isArchived: false,
    },
    updateData,
    {
      new: true,
      runValidators: true,
    }
  )
    .populate('createdBy', 'name email avatar')
    .populate('members.user', 'name email avatar');

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'updated',
    metadata: {
      fields: changedFields,
    },
  });

  return project;
};

export const archiveProject = async (workspaceId, projectId, userId) => {
  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      workspace: workspaceId,
      isArchived: false,
    },
    {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: userId,
    },
    {
      new: true,
      runValidators: true,
    }
  )
    .populate('createdBy', 'name email avatar')
    .populate('members.user', 'name email avatar')
    .populate('archivedBy', 'name email avatar');

  if (!project) {
    throw new ApiError(404, 'Project not found or already archived');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'archived',
  });

  return project;
};

export const restoreProject = async (workspaceId, projectId, userId) => {
  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      workspace: workspaceId,
      isArchived: true,
    },
    {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
    },
    {
      new: true,
      runValidators: true,
    }
  )
    .populate('createdBy', 'name email avatar')
    .populate('members.user', 'name email avatar');

  if (!project) {
    throw new ApiError(404, 'Archived project not found');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'restored',
  });

  return project;
};

export const updateProjectStatus = async (workspaceId, projectId, status, userId) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const oldStatus = project.status;

  project.status = status;

  await project.save();

  await project.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'members.user',
      select: 'name email avatar',
    },
  ]);

  await createProjectActivity({
    workspaceId,
    projectId,
    userId,
    action: 'status_changed',
    metadata: {
      from: oldStatus,
      to: status,
    },
  });

  return project;
};

export const addProjectMember = async (
  workspaceId,
  projectId,
  userId,
  performedBy,
  role = PROJECT_ROLES.MEMBER
) => {
  const existingProject = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!existingProject) {
    throw new ApiError(404, 'Project not found');
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    'members.user': userId,
  });

  if (!workspace) {
    throw new ApiError(400, 'User must be a workspace member before joining the project');
  }

  /*
   * Add with a conditional update rather than a read-modify-write.
   *
   * `'members.user': { $ne: userId }` is evaluated by the database as part of
   * the write, so two concurrent adds cannot both pass a check and push — the
   * second finds no document to update and is reported as a conflict. The
   * previous version read the project, tested the array in memory and saved the
   * whole array, which could leave one user listed twice with two different
   * roles.
   */
  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      workspace: workspaceId,
      isArchived: false,
      'members.user': { $ne: userId },
    },
    {
      $push: {
        members: {
          user: userId,
          role,
        },
      },
    },
    { new: true }
  );

  if (!project) {
    throw new ApiError(409, 'User is already a project member');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId: performedBy,
    action: 'member_added',
    metadata: {
      memberId: userId,
    },
  });

  // Notify the newly added member (unless they added themselves).
  await notifyProjectMemberAdded({
    workspaceId,
    projectId,
    project,
    actorId: performedBy,
    recipientId: userId,
  });

  await project.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'members.user',
      select: 'name email avatar',
    },
  ]);

  return project;
};

export const removeProjectMember = async (workspaceId, projectId, userId, performedBy) => {
  const existingProject = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!existingProject) {
    throw new ApiError(404, 'Project not found');
  }

  const memberExists = existingProject.members.some(
    (member) => member.user.toString() === userId.toString()
  );

  if (!memberExists) {
    throw new ApiError(404, 'User is not a project member');
  }

  if (existingProject.createdBy.toString() === userId.toString()) {
    throw new ApiError(400, 'Project creator cannot be removed from the project');
  }

  /*
   * Remove with an atomic pull, guarded on the membership still being there, so
   * a concurrent removal cannot produce a second, contradictory audit entry —
   * and so a concurrent add cannot be silently discarded by a whole-array save.
   */
  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      workspace: workspaceId,
      isArchived: false,
      'members.user': userId,
    },
    { $pull: { members: { user: userId } } },
    { new: true }
  );

  if (!project) {
    throw new ApiError(404, 'User is not a project member');
  }

  await createProjectActivity({
    workspaceId,
    projectId,
    userId: performedBy,
    action: 'member_removed',
    metadata: {
      memberId: userId,
    },
  });

  await project.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'members.user',
      select: 'name email avatar',
    },
  ]);

  return project;
};

export const changeProjectMemberRole = async (
  workspaceId,
  projectId,
  userId,
  newRole,
  performedBy
) => {
  const project = await Project.findOne({
    _id: projectId,
    workspace: workspaceId,
    isArchived: false,
  });

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  const member = project.members.find((member) => member.user.toString() === userId.toString());

  if (!member) {
    throw new ApiError(404, 'User is not a member of this project');
  }

  // Project owner cannot be changed to another role.
  if (member.user.toString() === project.createdBy.toString() && newRole !== PROJECT_ROLES.OWNER) {
    throw new ApiError(400, 'The project owner role cannot be changed');
  }

  // Only one project owner is allowed.
  if (newRole === PROJECT_ROLES.OWNER && member.user.toString() !== project.createdBy.toString()) {
    throw new ApiError(400, 'Only the project creator can be the project owner');
  }

  member.role = newRole;

  await project.save();

  await createProjectActivity({
    workspaceId,
    projectId,
    userId: performedBy,
    action: 'member_role_changed',
    metadata: {
      memberId: userId,
      role: newRole,
    },
  });

  // Notify the affected member (unless they changed their own role).
  await notifyProjectRoleChanged({
    workspaceId,
    projectId,
    project,
    actorId: performedBy,
    recipientId: userId,
    role: newRole,
  });

  await project.populate([
    {
      path: 'createdBy',
      select: 'name email avatar',
    },
    {
      path: 'members.user',
      select: 'name email avatar',
    },
  ]);

  return project;
};
