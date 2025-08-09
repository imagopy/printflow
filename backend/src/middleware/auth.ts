/**
 * Authentication Middleware
 * 
 * Handles JWT token verification and user authentication.
 * Supports both httpOnly cookies and Authorization header for flexibility.
 * 
 * @module middleware/auth
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { AuthUser, JwtPayload, AuthenticatedRequest } from '../types/auth.types';
import { UserRole } from '@prisma/client';

/**
 * Extract JWT token from request
 * Checks both httpOnly cookie and Authorization header
 * 
 * @param req - Express request
 * @returns {string | null} JWT token or null if not found
 */
function extractToken(req: Request): string | null {
  // Check httpOnly cookie first (preferred method)
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    return cookieToken;
  }

  // Check Authorization header as fallback
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Verify JWT token and extract payload
 * 
 * @param token - JWT token to verify
 * @returns {JwtPayload} Decoded token payload
 * @throws {AuthenticationError} If token is invalid or expired
 */
function verifyToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired', { expiredAt: error.expiredAt });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token', { error: error.message });
    }
    throw new AuthenticationError('Token verification failed');
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 * 
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    const payload = verifyToken(token);
    
    // Attach user to request
    const authReq = req as AuthenticatedRequest;
    authReq.user = {
      userId: payload.userId,
      email: payload.email,
      shopId: payload.shopId,
      role: payload.role,
    };

    logger.debug('User authenticated', {
      userId: payload.userId,
      shopId: payload.shopId,
      role: payload.role,
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Role-based access control middleware factory
 * Creates middleware that requires specific roles
 * 
 * @param allowedRoles - Array of allowed user roles
 * @returns {Function} Express middleware function
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authReq = req as AuthenticatedRequest;
      
      if (!authReq.user) {
        throw new AuthenticationError('User not authenticated');
      }

      if (!allowedRoles.includes(authReq.user.role)) {
        logger.warn('Access denied - insufficient role', {
          userId: authReq.user.userId,
          userRole: authReq.user.role,
          requiredRoles: allowedRoles,
          path: req.path,
        });
        
        throw new AuthorizationError(
          `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          {
            userRole: authReq.user.role,
            requiredRoles: allowedRoles,
          }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if no token present
 * Useful for endpoints that have different behavior for authenticated users
 * 
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);
    
    if (token) {
      const payload = verifyToken(token);
      const authReq = req as AuthenticatedRequest;
      authReq.user = {
        userId: payload.userId,
        email: payload.email,
        shopId: payload.shopId,
        role: payload.role,
      };
    }
    
    next();
  } catch (error) {
    // Log error but continue without authentication
    logger.debug('Optional authentication failed', { error });
    next();
  }
}

/**
 * Generate JWT token for user
 * 
 * @param user - User data to encode in token
 * @returns {string} Signed JWT token
 */
export function generateToken(user: {
  id: string;
  email: string;
  shopId: string;
  role: UserRole;
}): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    shopId: user.shopId,
    role: user.role,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'printflow',
    audience: 'printflow-api',
  });
}

/**
 * Set authentication cookie
 * Uses httpOnly cookie for security
 * 
 * @param res - Express response
 * @param token - JWT token to set
 */
export function setAuthCookie(res: Response, token: string): void {
  const maxAge = parseJwtExpiry(env.JWT_EXPIRES_IN);
  
  res.cookie('token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

/**
 * Clear authentication cookie
 * 
 * @param res - Express response
 */
export function clearAuthCookie(res: Response): void {
  res.clearCookie('token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Parse JWT expiry string to milliseconds
 * 
 * @param expiry - Expiry string (e.g., '8h', '7d', '30m')
 * @returns {number} Expiry in milliseconds
 */
function parseJwtExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 8 * 60 * 60 * 1000; // Default 8 hours
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case 's':
      return num * 1000;
    case 'm':
      return num * 60 * 1000;
    case 'h':
      return num * 60 * 60 * 1000;
    case 'd':
      return num * 24 * 60 * 60 * 1000;
    default:
      return 8 * 60 * 60 * 1000;
  }
}