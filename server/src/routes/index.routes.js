import { Router } from 'express';

const router = Router();

// Base Route
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to the Product Management API',
    version: '1.0.0',
  });
});

// Health Check Route
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    message: 'Server is running successfully.',
  });
});

export default router;
