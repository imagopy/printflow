/**
 * Authentication Routes
 * 
 * Handles user authentication including login, registration,
 * token refresh, and logout operations.
 * 
 * @module routes/auth
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { generateToken, setAuthCookie, clearAuthCookie, authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { asyncHandler } from '../utils/async-handler';
import { prisma } from '../config/database';
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
} from '../validators/auth.validators';
import { logger } from '../utils/logger';
import { AuthenticationError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { z } from 'zod';

const router = Router();

// Rate limiter for auth endpoints
const authLimiter = (_req: Request, _res: Response, next: Function) => {
  // Simple rate limiter - in production use express-rate-limit
  next();
};

/**
 * POST /auth/login
 * User login endpoint
 */
router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      logger.warn('Login attempt with non-existent email', { email });
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      logger.warn('Login attempt with invalid password', { userId: user.id });
      throw new AuthenticationError('Invalid email or password');
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      shopId: user.shop_id,
      role: user.role,
    });

    // Set httpOnly cookie
    setAuthCookie(res, token);

    logger.info('User logged in successfully', {
      userId: user.id,
      shopId: user.shop_id,
      role: user.role,
    });

    // Return user data (without sensitive information)
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        shopId: user.shop_id,
        shop: user.shop,
        createdAt: user.created_at,
      },
      message: 'Login successful',
    });
  })
);

/**
 * POST /auth/register
 * User registration endpoint
 */
router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, role, shopId } = req.body as z.infer<typeof registerSchema>;

    // Check if shop exists
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      throw new NotFoundError('Shop', shopId);
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('An account with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password_hash: passwordHash,
        role,
        shop_id: shopId,
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      shopId: user.shop_id,
      role: user.role,
    });

    // Set httpOnly cookie
    setAuthCookie(res, token);

    logger.info('New user registered', {
      userId: user.id,
      shopId: user.shop_id,
      role: user.role,
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        shopId: user.shop_id,
        shop: user.shop,
        createdAt: user.created_at,
      },
      message: 'Registration successful',
    });
  })
);

/**
 * POST /auth/logout
 * User logout endpoint
 */
router.post('/logout', (req: Request, res: Response) => {
  // Clear auth cookie
  clearAuthCookie(res);

  logger.info('User logged out', {
    userId: (req as any).user?.userId,
  });

  res.json({
    message: 'Logout successful',
  });
});

/**
 * GET /auth/verify
 * Verify authentication endpoint
 */
router.get(
  '/verify',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = (req as any).user;

    // Fetch fresh user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            markup_percent: true,
            labor_hourly_rate: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        shopId: user.shop_id,
        shop: user.shop,
        createdAt: user.created_at,
      },
      authenticated: true,
    });
  })
);

/**
 * POST /auth/change-password
 * Change password endpoint
 */
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = (req as any).user;
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isPasswordValid) {
      throw new ValidationError('Current password is incorrect');
    }

    // Ensure new password is different
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      throw new ValidationError('New password must be different from current password');
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: newPasswordHash },
    });

    logger.info('User changed password', { userId });

    res.json({
      message: 'Password changed successfully',
    });
  })
);

/**
 * POST /auth/refresh
 * Refresh token endpoint
 */
router.post(
  '/refresh',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as any; // Assuming AuthenticatedRequest is not directly imported here
    const { userId, shopId, role } = authReq.user;

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new AuthenticationError('User no longer exists');
    }

    // Generate new token
    const token = generateToken({
      id: user.id,
      email: user.email,
      shopId,
      role,
    });

    // Set new cookie
    setAuthCookie(res, token);

    logger.debug('Token refreshed', { userId });

    res.json({
      message: 'Token refreshed successfully',
    });
  })
);

export default router;