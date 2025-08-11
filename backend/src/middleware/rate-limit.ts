/**
 * Rate Limiting Middleware
 * 
 * Implements rate limiting to prevent abuse and ensure fair usage.
 * Uses in-memory store by default, Redis for production scalability.
 * 
 * @module middleware/rate-limit
 */

import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response } from 'express';
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
 * Custom rate limit handler
 * Provides consistent error response for rate limit violations
 * 
 * @param _req - Express request (unused)
 * @param res - Express response
 */
function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    error: {
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
    },
  });
}

/**
 * General API rate limiter
 * Applied to all endpoints for basic protection
 */
export const generalLimiter = rateLimit({
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
export const authLimiter = rateLimit({
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
export const quoteGenerationLimiter = rateLimit({
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
export const pdfGenerationLimiter = rateLimit({
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
export const emailLimiter = rateLimit({
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
export const writeLimiter = rateLimit({
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
 * Creates a basic rate limiter for general endpoints
 * Uses in-memory store by default
 * 
 * @param options - Rate limiter options
 * @returns Express rate limit middleware
 */
export const createRateLimiter = (options?: Partial<Options>) => {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
      });
    },
    ...options,
  });
};

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