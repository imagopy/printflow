/**
 * Authentication Middleware
 * 
 * Handles JWT token validation and user authentication.
 * Implements role-based access control (RBAC).
 * 
 * @module middleware/auth
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '@prisma/client';
import { logger } from '../utils/logger';
import { AuthenticationError, AuthorizationError } from '../utils/errors';

/**
 * JWT payload interface
 */
interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  shopId: string;
  iat?: number;
  exp?: number;
}

/**
 * Extended request interface with user information
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    shopId: string;
  };
}

/**
 * Extract token from request
 * Checks Authorization header and cookies
 * 
 * @param req - Express request
 * @returns JWT token or null
 */
function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check cookies
  if (req.cookies?.['auth-token']) {
    return req.cookies['auth-token'];
  }
  
  return null;
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 * 
 * @param req - Express request
 * @param res - Express response  
 * @param next - Express next function
 */
export const authenticateToken = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }
    
    // Verify token
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    
    // Attach user to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      shopId: decoded.shopId,
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new AuthenticationError('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
    } else {
      next(error);
    }
  }
};

/**
 * Creates middleware to require specific user roles
 * 
 * @param roles - Array of allowed roles
 * @returns Express middleware function
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('User not authenticated');
      }
      
      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('Authorization failed', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: allowedRoles,
        });
        
        throw new AuthorizationError(
          `Access denied. Required role: ${allowedRoles.join(' or ')}`
        );
      }
      
      logger.debug('User authorized', {
        userId: req.user.id,
        role: req.user.role,
        allowedRoles,
      });
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Optional authentication middleware
 * Attaches user if token is present, but doesn't require it
 * 
 * @param req - Express request
 * @param res - Response object
 * @param next - Express next function
 */
export const optionalAuth = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req);
    
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          shopId: decoded.shopId,
        };
      } catch (error) {
        // Invalid token, but that's okay for optional auth
        logger.debug('Optional authentication failed', { error: error as Error });
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to validate API keys for service-to-service auth
 * 
 * @param req - Express request
 * @param _res - Response object (unused)
 * @param next - Express next function
 */
export const authenticateApiKey = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      throw new AuthenticationError('API key required');
    }
    
    // In a real application, validate against stored API keys
    // For now, just check if it matches a pattern
    if (!apiKey.startsWith('pk_')) {
      throw new AuthenticationError('Invalid API key format');
    }
    
    // Set a service user context
    req.user = {
      id: 'service',
      email: 'service@printflow.com',
      role: UserRole.admin,
      shopId: 'system',
    };
    
    next();
  } catch (error) {
    logger.error('API key authentication failed', { error: error as Error });
    next(error);
  }
};

/**
 * Alias for backward compatibility
 */
export const authenticate = authenticateToken;

/**
 * Generate JWT token for user
 * 
 * @param user - User data to encode
 * @returns Signed JWT token
 */
export function generateToken(user: {
  id: string;
  email: string;
  role: UserRole;
  shopId: string;
}): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    shopId: user.shopId,
  };
  
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Set auth cookie
 */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie('auth-token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

/**
 * Clear auth cookie
 */
export function clearAuthCookie(res: Response): void {
  res.clearCookie('auth-token');
}