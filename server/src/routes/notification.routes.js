import { Router } from 'express';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';

import * as notificationController from '../controllers/notification.controller.js';

import {
  listNotificationsSchema,
  notificationIdSchema,
  emptyRequestSchema,
} from '../validators/notification.validator.js';

const router = Router();

/*
 * Notifications are personal, so these routes are only authenticated
 * (no workspace/project scoping) and every query is filtered by the
 * authenticated user's id as the recipient.
 */
router.get(
  '/',
  authenticate,
  validate(listNotificationsSchema),
  notificationController.getNotifications
);

router.get(
  '/unread',
  authenticate,
  validate(listNotificationsSchema),
  notificationController.getUnreadNotifications
);

router.get(
  '/unread/count',
  authenticate,
  validate(emptyRequestSchema),
  notificationController.getUnreadCount
);

router.patch(
  '/read-all',
  authenticate,
  validate(emptyRequestSchema),
  notificationController.markAllNotificationsAsRead
);

router.patch(
  '/:notificationId/read',
  authenticate,
  validate(notificationIdSchema),
  notificationController.markNotificationAsRead
);

router.delete(
  '/:notificationId',
  authenticate,
  validate(notificationIdSchema),
  notificationController.deleteNotification
);

export default router;
