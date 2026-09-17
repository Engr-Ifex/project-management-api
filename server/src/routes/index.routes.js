import { Router } from 'express';

import ApiResponse from '../utils/ApiResponse.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import workspaceRoutes from './workspace.routes.js';
import teamRoutes from './team.routes.js';
import projectRoutes from './project.routes.js';
import taskRoutes from './task.routes.js';
import taskCommentRoutes from './taskComment.routes.js';
import labelRoutes from './label.routes.js';
import attachmentRoutes from './attachment.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import notificationRoutes from './notification.routes.js';
import docsRoutes from './docs.routes.js';

const router = Router();

/*
 * API index.
 *
 * Uses the standard success envelope like every other endpoint. It previously
 * returned a bespoke `{ success, message, version }` shape, which meant a
 * client could not read `data` or `statusCode` here as it would everywhere
 * else.
 */
router.get('/', (req, res) => {
  res.status(200).json(
    new ApiResponse(200, 'Welcome to the Product Management API', {
      version: '1.0.0',
      documentation: '/api/v1/openapi.json',
    })
  );
});

/*
 * Liveness and readiness probes live in `health.routes.js`. They are mounted
 * in app.js ahead of the API rate limiter, so they are not registered here.
 */

// Authentication Routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/', teamRoutes);
router.use('/workspaces', projectRoutes);
router.use('/workspaces', taskRoutes);
router.use('/workspaces', taskCommentRoutes);
router.use('/workspaces', labelRoutes);
router.use('/workspaces', attachmentRoutes);
router.use('/workspaces', dashboardRoutes);
router.use('/notifications', notificationRoutes);

// OpenAPI document
router.use('/', docsRoutes);

export default router;
