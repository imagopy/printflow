/**
 * Authentication Type Definitions
 * 
 * Defines types for JWT tokens, authenticated users, and Express request extensions.
 * These types ensure type safety throughout the authentication flow.
 * 
 * @module types/auth
 */

import { UserRole } from '@prisma/client';
import { Request } from 'express';

/**
 * JWT token payload structure
 * Contains user identification and authorization data
 */
export interface JwtPayload {
  userId: string;
  email: string;
  shopId: string;
  role: UserRole;
  iat?: number; // Issued at timestamp
  exp?: number; // Expiration timestamp
}

/**
 * Authenticated user information
 * Attached to Express request after authentication
 */
export interface AuthUser {
  userId: string;
  email: string;
  shopId: string;
  role: UserRole;
}

/**
 * Login request body
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Registration request body
 */
export interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
  shopId: string;
}

/**
 * Authentication response
 */
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
    shopId: string;
  };
  token?: string; // Only included if not using httpOnly cookies
}

/**
 * Express Request with authenticated user
 * Extends Express Request to include user property
 */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  requestId: string;
}

/**
 * Type guard to check if request is authenticated
 * 
 * @param req - Express request
 * @returns {boolean} True if request has authenticated user
 */
export function isAuthenticatedRequest(req: Request): req is AuthenticatedRequest {
  return 'user' in req && req.user !== undefined;
}

/**
 * Password validation requirements
 */
export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

/**
 * Default password requirements
 */
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};