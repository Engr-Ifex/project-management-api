import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import * as taskCommentService from '../services/taskComment.service.js';

export const createTaskComment = asyncHandler(
  async (req, res) => {
    const comment =
      await taskCommentService.createTaskComment(
        req.params.workspaceId,
        req.params.projectId,
        req.params.taskId,
        req.user.id,
        req.body.content
      );

    return res.status(201).json(
      new ApiResponse(
        201,
        'Comment added successfully',
        { comment }
      )
    );
  }
);

export const getTaskComments = asyncHandler(
  async (req, res) => {
    const comments =
      await taskCommentService.getTaskComments(
        req.params.workspaceId,
        req.params.projectId,
        req.params.taskId
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Comments retrieved successfully',
        { comments }
      )
    );
  }
);

export const updateTaskComment = asyncHandler(
  async (req, res) => {
    const comment =
      await taskCommentService.updateTaskComment(
        req.params.workspaceId,
        req.params.projectId,
        req.params.taskId,
        req.params.commentId,
        req.user.id,
        req.body.content
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Comment updated successfully',
        { comment }
      )
    );
  }
);

export const deleteTaskComment = asyncHandler(
  async (req, res) => {
    await taskCommentService.deleteTaskComment(
      req.params.workspaceId,
      req.params.projectId,
      req.params.taskId,
      req.params.commentId,
      req.user.id
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        'Comment deleted successfully'
      )
    );
  }
);