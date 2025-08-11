/**
 * Error Handling Utilities
 * 
 * Provides structured error classes for consistent error handling across the application.
 * Each error type includes appropriate HTTP status codes and error codes for client handling.
 * 
 * @module utils/errors
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;
  public readonly validationErrors?: Array<{ field: string; message: string }>;

  /**
   * Creates an application error
   * 
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code
   * @param code - Machine-readable error code
   * @param isOperational - Whether error is expected (true) or programming error (false)
   * @param context - Additional context for debugging
   */
  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.context = context;
    
    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Set prototype explicitly for instanceof to work
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Authentication error - Invalid credentials or token
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', context?: Record<string, any>) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, context);
  }
}

/**
 * Authorization error - Insufficient permissions
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', context?: Record<string, any>) {
    super(message, 403, 'AUTHORIZATION_ERROR', true, context);
  }
}

/**
 * Validation error - Invalid input data
 */
export class ValidationError extends AppError {
  public readonly validationErrors?: Array<{ field: string; message: string }>;

  constructor(
    message: string = 'Validation failed',
    validationErrors?: Array<{ field: string; message: string }>,
    context?: Record<string, any>
  ) {
    super(message, 400, 'VALIDATION_ERROR', true, context);
    this.validationErrors = validationErrors;
  }
}

/**
 * Not found error - Resource does not exist
 */
export class NotFoundError extends AppError {
  constructor(
    resource: string,
    identifier?: string | number,
    context?: Record<string, any>
  ) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', true, context);
  }
}

/**
 * Conflict error - Resource already exists or state conflict
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', context?: Record<string, any>) {
    super(message, 409, 'CONFLICT_ERROR', true, context);
  }
}

/**
 * Rate limit error - Too many requests
 */
export class RateLimitError extends AppError {
  constructor(
    retryAfter?: number,
    context?: Record<string, any>
  ) {
    const message = retryAfter
      ? `Rate limit exceeded. Try again in ${retryAfter} seconds`
      : 'Rate limit exceeded';
    super(message, 429, 'RATE_LIMIT_ERROR', true, { ...context, retryAfter });
  }
}

/**
 * Business logic error - Custom business rule violation
 */
export class BusinessError extends AppError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, 400, code, true, context);
  }
}

/**
 * External service error - Third-party service failure
 */
export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string = 'External service error',
    context?: Record<string, any>
  ) {
    super(`${service}: ${message}`, 503, 'EXTERNAL_SERVICE_ERROR', true, context);
  }
}

/**
 * Database error wrapper - Wraps database errors with context
 */
export class DatabaseError extends AppError {
  constructor(
    message: string = 'Database operation failed',
    originalError?: Error,
    context?: Record<string, any>
  ) {
    super(message, 500, 'DATABASE_ERROR', false, {
      ...context,
      originalError: originalError?.message,
    });
  }
}

/**
 * Type guard to check if error is operational
 * Operational errors are expected and can be handled gracefully
 * 
 * @param error - Error to check
 * @returns {boolean} True if error is operational
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert unknown error to AppError
 * Ensures consistent error handling
 * 
 * @param error - Unknown error
 * @returns {AppError} Normalized application error
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('unique constraint')) {
      return new ConflictError('Resource already exists', { originalError: error.message });
    }
    
    if (error.message.includes('foreign key constraint')) {
      return new ValidationError('Invalid reference to related resource', undefined, {
        originalError: error.message,
      });
    }
    
    return new AppError(
      error.message,
      500,
      'INTERNAL_ERROR',
      false,
      { originalError: error.stack }
    );
  }
  
  // Handle non-Error objects
  return new AppError(
    'An unknown error occurred',
    500,
    'UNKNOWN_ERROR',
    false,
    { error: String(error) }
  );
}