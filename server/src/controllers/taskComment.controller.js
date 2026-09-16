import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import * as taskCommentService from '../services/taskComment.service.js';

import { hasPermission } from '../constants/rolePermissions.js';
import { WORKSPACE_PERMISSIONS } from '../constants/workspacePermissions.js';

export const createTaskComment = asyncHandler(async (req, res) => {
  const comment = await taskCommentService.createTaskComment(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.user._id,
    req.body.content
  );

  return res.status(201).json(new ApiResponse(201, 'Comment added successfully', { comment }));
});

export const getTaskComments = asyncHandler(async (req, res) => {
  const result = await taskCommentService.getTaskComments(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.validatedQuery ?? {}
  );

  return res.status(200).json(new ApiResponse(200, 'Comments retrieved successfully', result));
});

export const getTaskCommentById = asyncHandler(async (req, res) => {
  const comment = await taskCommentService.getTaskCommentById(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.params.commentId
  );

  return res.status(200).json(new ApiResponse(200, 'Comment retrieved successfully', { comment }));
});

export const updateTaskComment = asyncHandler(async (req, res) => {
  const comment = await taskCommentService.updateTaskComment(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.params.commentId,
    req.user._id,
    req.body.content
  );

  return res.status(200).json(new ApiResponse(200, 'Comment updated successfully', { comment }));
});

export const deleteTaskComment = asyncHandler(async (req, res) => {
  /*
   * Workspace owners/admins hold elevated authority over projects in their
   * workspace (same rule applied by requireProjectPermission). They are the
   * only callers besides the author allowed to delete a comment.
   */
  const isWorkspaceElevated = hasPermission(
    req.workspaceMember.role,
    WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE
  );

  await taskCommentService.deleteTaskComment(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.params.commentId,
    req.user._id,
    isWorkspaceElevated
  );

  return res.status(200).json(new ApiResponse(200, 'Comment deleted successfully'));
});
