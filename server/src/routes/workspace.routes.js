import { Router } from 'express';

import workspaceController from '../controllers/workspace.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';

import {
  createWorkspaceSchema,
  workspaceIdSchema,
  updateWorkspaceSchema,
} from '../validators/workspace.validator.js';

const router = Router();

router.post(
  '/',
  authenticate,
  validate(createWorkspaceSchema),
  workspaceController.createWorkspace
);

router.get('/', authenticate, workspaceController.getUserWorkspaces);
router.get(
  '/:workspaceId',
  authenticate,
  validate(workspaceIdSchema),
  workspaceController.getWorkspaceById
);
router.patch(
  '/:workspaceId',
  authenticate,
  validate(updateWorkspaceSchema),
  workspaceController.updateWorkspace
);

export default router;
