/**
 * Error Handling Middleware
 * 
 * Global error handler that catches all errors and returns consistent responses.
 * Logs errors appropriately and hides sensitive information in production.
 * 
 * @module middleware/error-handler
 */

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError, isOperationalError, normalizeError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env, isProduction } from '../config/env';

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
 * Handle Prisma errors
 * Converts Prisma errors to appropriate AppError instances
 * 
 * @param error - Prisma error
 * @returns {AppError} Converted application error
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': {
      // Unique constraint violation
      const target = error.meta?.target as string[] | undefined;
      const field = target?.[0] || 'field';
      return new AppError(
        `A record with this ${field} already exists`,
        409,
        'UNIQUE_CONSTRAINT_VIOLATION',
        true,
        { field, originalError: error.message }
      );
    }
    
    case 'P2003': {
      // Foreign key constraint violation
      const field = error.meta?.field_name as string | undefined;
      return new AppError(
        `Invalid reference to related record${field ? ` in field '${field}'` : ''}`,
        400,
        'FOREIGN_KEY_VIOLATION',
        true,
        { field, originalError: error.message }
      );
    }
    
    case 'P2025': {
      // Record not found
      return new AppError(
        'The requested record was not found',
        404,
        'RECORD_NOT_FOUND',
        true,
        { originalError: error.message }
      );
    }
    
    case 'P2014': {
      // Invalid ID
      return new AppError(
        'Invalid ID provided',
        400,
        'INVALID_ID',
        true,
        { originalError: error.message }
      );
    }
    
    default: {
      // Other Prisma errors
      return new AppError(
        'Database operation failed',
        500,
        'DATABASE_ERROR',
        false,
        { code: error.code, originalError: error.message }
      );
    }
  }
}

/**
 * Global error handler middleware
 * 
 * @param error - Error object
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware (unused but required by Express)
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Convert to AppError if needed
  let appError: AppError;
  
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    appError = handlePrismaError(error);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    appError = new AppError(
      'Invalid data provided',
      400,
      'VALIDATION_ERROR',
      true,
      { originalError: error.message }
    );
  } else {
    appError = normalizeError(error);
  }

  // Log error with appropriate level
  const logContext = {
    error: error.message,
    stack: error.stack,
    statusCode: appError.statusCode,
    code: appError.code,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.userId,
    shopId: (req as any).user?.shopId,
    requestId: (req as any).requestId,
    context: appError.context,
  };

  if (isOperationalError(error)) {
    logger.warn('Operational error occurred', logContext);
  } else {
    logger.error('Programming error occurred', logContext);
  }

  // Prepare error response
  const errorResponse: ErrorResponse = {
    error: {
      message: appError.message,
      code: appError.code,
      statusCode: appError.statusCode,
    },
    requestId: (req as any).requestId,
  };

  // Add validation errors if present
  if ('validationErrors' in appError && appError.validationErrors) {
    errorResponse.error.validationErrors = appError.validationErrors;
  }

  // Add stack trace and context in development
  if (!isProduction()) {
    errorResponse.error.stack = error.stack;
    errorResponse.error.context = appError.context;
  }

  // Send error response
  res.status(appError.statusCode).json(errorResponse);
}

/**
 * Not found handler
 * Catches requests to undefined routes
 * 
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const error = new AppError(
    `Route ${req.method} ${req.path} not found`,
    404,
    'ROUTE_NOT_FOUND',
    true,
    { method: req.method, path: req.path }
  );
  
  next(error);
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