import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import * as notificationService from '../services/notification.service.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.getUserNotifications(
    req.user._id,
    req.validatedQuery ?? {}
  );

  return res.status(200).json(new ApiResponse(200, 'Notifications retrieved successfully', result));
});

export const getUnreadNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.getUnreadNotifications(
    req.user._id,
    req.validatedQuery ?? {}
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Unread notifications retrieved successfully', result));
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadNotificationCount(req.user._id);

  return res
    .status(200)
    .json(new ApiResponse(200, 'Unread notification count retrieved successfully', { count }));
});

export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markNotificationAsRead(
    req.user._id,
    req.params.notificationId
  );

  return res
    .status(200)
    .json(new ApiResponse(200, 'Notification marked as read', { notification }));
});

export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllNotificationsAsRead(req.user._id);

  return res.status(200).json(new ApiResponse(200, 'All notifications marked as read', result));
});

export const deleteNotification = asyncHandler(async (req, res) => {
  await notificationService.deleteNotification(req.user._id, req.params.notificationId);

  return res.status(200).json(new ApiResponse(200, 'Notification deleted successfully'));
});
