import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import * as labelService from '../services/label.service.js';

export const createLabel = asyncHandler(async (req, res) => {
  const label = await labelService.createLabel(
    req.params.workspaceId,
    req.params.projectId,
    req.user._id,
    req.body
  );

  return res.status(201).json(new ApiResponse(201, 'Label created successfully', { label }));
});

export const getProjectLabels = asyncHandler(async (req, res) => {
  const result = await labelService.getProjectLabels(
    req.params.workspaceId,
    req.params.projectId,
    req.validatedQuery ?? {}
  );

  return res.status(200).json(new ApiResponse(200, 'Labels retrieved successfully', result));
});

export const getLabelById = asyncHandler(async (req, res) => {
  const label = await labelService.getLabelById(
    req.params.workspaceId,
    req.params.projectId,
    req.params.labelId
  );

  return res.status(200).json(new ApiResponse(200, 'Label retrieved successfully', { label }));
});

export const updateLabel = asyncHandler(async (req, res) => {
  const label = await labelService.updateLabel(
    req.params.workspaceId,
    req.params.projectId,
    req.params.labelId,
    req.user._id,
    req.body
  );

  return res.status(200).json(new ApiResponse(200, 'Label updated successfully', { label }));
});

export const deleteLabel = asyncHandler(async (req, res) => {
  await labelService.deleteLabel(
    req.params.workspaceId,
    req.params.projectId,
    req.params.labelId,
    req.user._id
  );

  return res.status(200).json(new ApiResponse(200, 'Label deleted successfully'));
});

export const assignLabelToTask = asyncHandler(async (req, res) => {
  const task = await labelService.assignLabelToTask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.body.labelId,
    req.user._id
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Label assigned to task successfully', { task }));
});

export const removeLabelFromTask = asyncHandler(async (req, res) => {
  const task = await labelService.removeLabelFromTask(
    req.params.workspaceId,
    req.params.projectId,
    req.params.taskId,
    req.params.labelId,
    req.user._id
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Label removed from task successfully', { task }));
});
