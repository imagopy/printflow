/**
 * Error Handling Middleware
 * 
 * Centralized error handling for the application.
 * Catches and formats all errors before sending to client.
 * 
 * @module middleware/error-handler
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError, ValidationError } from '../utils/errors';

/**
 * Error response structure
 */
interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    validationErrors?: Array<{ field: string; message: string }>;
    stack?: string;
    context?: Record<string, any>;
  };
  requestId?: string;
}

/**
 * Handle Prisma database errors
 * Converts Prisma errors to appropriate AppError types
 * 
 * @param error - Prisma error
 * @returns AppError instance
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const field = (error.meta?.target as string[])?.[0] || 'field';
      return new AppError(
        `A record with this ${field} already exists`,
        409,
        'DUPLICATE_ENTRY'
      );
      
    case 'P2025':
      // Record not found
      return new AppError(
        'The requested resource was not found',
        404,
        'NOT_FOUND'
      );
      
    case 'P2003':
      // Foreign key constraint violation
      return new AppError(
        'Related resource not found',
        400,
        'INVALID_REFERENCE'
      );
      
    case 'P2014':
      // Invalid ID
      return new AppError(
        'Invalid ID provided',
        400,
        'INVALID_ID'
      );
      
    default:
      // Generic database error
      return new AppError(
        env.NODE_ENV === 'development' ? error.message : 'Database operation failed',
        500,
        'DATABASE_ERROR'
      );
  }
}

/**
 * Global error handler middleware
 * Catches all errors and formats consistent error responses
 * 
 * @param error - Error object
 * @param req - Express request
 * @param res - Express response
 * @param _next - Express next function (unused)
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error details
  logger.error('Request error', {
    error: error as Error,
    request: {
      method: req.method,
      url: req.url,
      params: req.params,
      query: req.query,
      body: req.body,
      headers: req.headers,
    },
  });

  // Handle different error types
  let appError: AppError;
  
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    const validationErrors = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    appError = new ValidationError('Validation failed', validationErrors);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    appError = handlePrismaError(error);
  } else {
    // Unknown errors
    appError = new AppError(
      env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      500,
      'INTERNAL_ERROR'
    );
  }

  // Build error response
  const errorResponse: any = {
    error: {
      message: appError.message,
      code: appError.code,
      statusCode: appError.statusCode,
    },
  };

  // Add validation errors if present
  if (appError instanceof ValidationError && appError.validationErrors) {
    errorResponse.error.validationErrors = appError.validationErrors;
  }

  // Add stack trace in development
  if (env.NODE_ENV === 'development' && error.stack) {
    errorResponse.error.stack = error.stack;
  }

  // Send error response
  res.status(appError.statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 * Catches requests to undefined routes
 * 
 * @param req - Express request
 * @param res - Express response
 * @param _next - Express next function (unused)
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const error = new AppError(
    `Cannot ${req.method} ${req.path}`,
    404,
    'ROUTE_NOT_FOUND'
  );
  
  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  
  res.status(404).json({
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    },
  });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 * 
 * @param fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create error response for specific scenarios
 * Utility function for consistent error responses
 * 
 * @param res - Express response
 * @param error - AppError instance
 * @param requestId - Optional request ID
 */
export function sendErrorResponse(
  res: Response,
  error: AppError,
  requestId?: string
): void {
  const errorResponse: ErrorResponse = {
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    },
    requestId,
  };

  if ('validationErrors' in error && error.validationErrors) {
    errorResponse.error.validationErrors = error.validationErrors;
  }

  res.status(error.statusCode).json(errorResponse);
}