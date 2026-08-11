import { Router } from 'express';

import workspaceController from '../controllers/workspace.controller.js';

import authenticate from '../middlewares/authenticate.middleware.js';
import validate from '../middlewares/validate.middleware.js';

import { createWorkspaceSchema } from '../validators/workspace.validator.js';

const router = Router();

router.post(
  '/',
  authenticate,
  validate(createWorkspaceSchema),
  workspaceController.createWorkspace
);

router.get('/', authenticate, workspaceController.getUserWorkspaces);

export default router;
