/**
 * Rate Limiting Middleware
 * 
 * Implements rate limiting to prevent abuse and ensure fair usage.
 * Different limits for general API access and resource-intensive operations.
 * 
 * @module middleware/rate-limit
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';
import { RateLimitError } from '../utils/errors';
import { env } from '../config/env';
import { AuthenticatedRequest } from '../types/auth.types';

/**
 * Custom key generator that includes user ID and shop ID
 * Provides per-user rate limiting within shops
 * 
 * @param req - Express request
 * @returns {string} Rate limit key
 */
function generateKey(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  
  if (authReq.user) {
    // Authenticated users: limit per user within shop
    return `${authReq.user.shopId}:${authReq.user.userId}`;
  }
  
  // Unauthenticated users: limit by IP
  return req.ip || 'unknown';
}

/**
 * Custom handler for rate limit exceeded
 * Returns consistent error response
 */
function rateLimitHandler(req: Request, res: Response): void {
  const retryAfter = res.getHeader('Retry-After');
  const retrySeconds = typeof retryAfter === 'string' ? parseInt(retryAfter, 10) : undefined;
  
  const error = new RateLimitError(retrySeconds);
  
  res.status(error.statusCode).json({
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      retryAfter: retrySeconds,
    },
  });
}

/**
 * General API rate limiter
 * Applied to all endpoints for basic protection
 */
export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // 1000 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: generateKey,
  handler: rateLimitHandler,
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by IP for auth endpoints
    return req.ip || 'unknown';
  },
  handler: rateLimitHandler,
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * Quote generation rate limiter
 * Prevents abuse of resource-intensive pricing calculations
 */
export const quoteGenerationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS || 60 * 1000, // Default 1 minute
  max: env.RATE_LIMIT_MAX_REQUESTS || 100, // Default 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: generateKey,
  handler: rateLimitHandler,
});

/**
 * PDF generation rate limiter
 * Strict limits for resource-intensive operations
 */
export const pdfGenerationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 PDFs per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: generateKey,
  handler: rateLimitHandler,
});

/**
 * Email sending rate limiter
 * Prevents spam and protects email reputation
 */
export const emailLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 emails per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: generateKey,
  handler: rateLimitHandler,
});

/**
 * API write operations rate limiter
 * For POST, PUT, DELETE operations
 */
export const writeLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 write operations per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: generateKey,
  handler: rateLimitHandler,
  skip: (req: Request) => {
    // Only apply to write operations
    return !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  },
});

/**
 * Create custom rate limiter
 * Factory function for endpoint-specific limits
 * 
 * @param options - Rate limit options
 * @returns {RateLimitRequestHandler} Configured rate limiter
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}): RateLimitRequestHandler {
  return rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || generateKey,
    handler: rateLimitHandler,
  });
}

/**
 * Rate limit configuration for different endpoint groups
 */
export const rateLimitConfig = {
  auth: {
    login: authLimiter,
    register: createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }), // 10 registrations per hour
    passwordReset: createRateLimiter({ windowMs: 60 * 60 * 1000, max: 3 }), // 3 reset requests per hour
  },
  quotes: {
    create: quoteGenerationLimiter,
    send: emailLimiter,
    generatePdf: pdfGenerationLimiter,
  },
  general: {
    read: generalLimiter,
    write: writeLimiter,
  },
};