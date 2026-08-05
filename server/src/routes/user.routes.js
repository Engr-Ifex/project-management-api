import express from 'express';

import authenticate from '../middlewares/authenticate.middleware.js';
import {
  getProfile,
  updateProfile,
  updateAvatar,
  changePassword,
} from '../controllers/user.controller.js';

import validate from '../middlewares/validate.middleware.js';
import { updateProfileSchema, changePasswordSchema } from '../validators/user.validator.js';
import upload from '../middlewares/upload.middleware.js';

const router = express.Router();

router.get('/profile', authenticate, getProfile);

router.patch('/profile', authenticate, validate(updateProfileSchema), updateProfile);

router.patch('/avatar', authenticate, upload.single('avatar'), updateAvatar);

router.patch('/change-password', authenticate, validate(changePasswordSchema), changePassword);

export default router;
