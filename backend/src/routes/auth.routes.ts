/**
 * Authentication Routes
 * 
 * Handles user authentication including login, registration, logout,
 * and token management with proper security measures.
 * 
 * @module routes/auth
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { 
  authenticate, 
  generateToken, 
  setAuthCookie, 
  clearAuthCookie 
} from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { authLimiter } from '../middleware/rate-limit';
import { asyncHandler } from '../middleware/error-handler';
import { 
  loginSchema, 
  registerSchema, 
  changePasswordSchema,
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest
} from '../validators/auth.validators';
import { 
  AuthenticationError, 
  ConflictError, 
  NotFoundError,
  ValidationError 
} from '../utils/errors';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../types/auth.types';

const router = Router();

/**
 * User login endpoint
 * Authenticates user and returns JWT token
 * 
 * POST /auth/login
 */
router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginRequest;

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
 * User registration endpoint
 * Creates new user account with hashed password
 * 
 * POST /auth/register
 */
router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, role, shopId } = req.body as RegisterRequest;

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
 * User logout endpoint
 * Clears authentication cookie
 * 
 * POST /auth/logout
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
 * Verify authentication endpoint
 * Returns current user data if authenticated
 * 
 * GET /auth/verify
 */
router.get(
  '/verify',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;

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
 * Change password endpoint
 * Allows authenticated users to change their password
 * 
 * POST /auth/change-password
 */
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const { currentPassword, newPassword } = req.body as ChangePasswordRequest;

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
 * Refresh token endpoint
 * Issues a new JWT token for authenticated users
 * 
 * POST /auth/refresh
 */
router.post(
  '/refresh',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
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