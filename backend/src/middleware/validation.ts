/**
 * Validation Middleware
 * 
 * Provides request validation using Zod schemas.
 * Validates body, query, and params with detailed error messages.
 * 
 * @module middleware/validation
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Validation target types
 */
export type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Validation options
 */
export interface ValidationOptions {
  /**
   * Whether to strip unknown properties
   * @default true
   */
  stripUnknown?: boolean;
  
  /**
   * Custom error message
   */
  errorMessage?: string;
  
  /**
   * Whether to log validation errors
   * @default true
   */
  logErrors?: boolean;
}

/**
 * Format Zod error into user-friendly format
 * 
 * @param error - Zod validation error
 * @returns {Array} Formatted validation errors
 */
function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Create validation middleware for request data
 * 
 * @param schema - Zod schema to validate against
 * @param target - Part of request to validate
 * @param options - Validation options
 * @returns {Function} Express middleware function
 */
export function validate(
  schema: ZodSchema,
  target: ValidationTarget = 'body',
  options: ValidationOptions = {}
) {
  const {
    stripUnknown = true,
    errorMessage = 'Validation failed',
    logErrors = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get data to validate based on target
      const dataToValidate = req[target];

      // Parse and validate data
      const validatedData = await schema.parseAsync(dataToValidate);

      // Replace request data with validated data
      if (stripUnknown) {
        req[target] = validatedData;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = formatZodError(error);

        if (logErrors) {
          logger.warn('Request validation failed', {
            target,
            errors: validationErrors,
            path: req.path,
            method: req.method,
          });
        }

        next(new ValidationError(errorMessage, validationErrors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request body
 * Convenience function for body validation
 * 
 * @param schema - Zod schema
 * @param options - Validation options
 * @returns {Function} Express middleware
 */
export function validateBody(schema: ZodSchema, options?: ValidationOptions) {
  return validate(schema, 'body', options);
}

/**
 * Validate query parameters
 * Convenience function for query validation
 * 
 * @param schema - Zod schema
 * @param options - Validation options
 * @returns {Function} Express middleware
 */
export function validateQuery(schema: ZodSchema, options?: ValidationOptions) {
  return validate(schema, 'query', options);
}

/**
 * Validate route parameters
 * Convenience function for params validation
 * 
 * @param schema - Zod schema
 * @param options - Validation options
 * @returns {Function} Express middleware
 */
export function validateParams(schema: ZodSchema, options?: ValidationOptions) {
  return validate(schema, 'params', options);
}

/**
 * Validate multiple parts of request
 * 
 * @param schemas - Object with schemas for different parts
 * @param options - Validation options
 * @returns {Function} Express middleware
 */
export function validateRequest(
  schemas: {
    body?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
  },
  options?: ValidationOptions
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate each part
    for (const [target, schema] of Object.entries(schemas)) {
      if (schema) {
        try {
          const dataToValidate = req[target as ValidationTarget];
          const validatedData = await schema.parseAsync(dataToValidate);
          
          if (options?.stripUnknown !== false) {
            req[target as ValidationTarget] = validatedData;
          }
        } catch (error) {
          if (error instanceof ZodError) {
            const targetErrors = formatZodError(error).map((err) => ({
              field: `${target}.${err.field}`,
              message: err.message,
            }));
            errors.push(...targetErrors);
          }
        }
      }
    }

    if (errors.length > 0) {
      if (options?.logErrors !== false) {
        logger.warn('Request validation failed', {
          errors,
          path: req.path,
          method: req.method,
        });
      }

      next(new ValidationError(options?.errorMessage || 'Validation failed', errors));
    } else {
      next();
    }
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  /**
   * UUID validation
   */
  uuid: z.string().uuid('Invalid ID format'),
  
  /**
   * Pagination query parameters
   */
  pagination: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    pageSize: z.string().regex(/^\d+$/).transform(Number).default('20'),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
  
  /**
   * Date range query parameters
   */
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
  
  /**
   * Search query parameter
   */
  search: z.object({
    q: z.string().min(1).optional(),
  }),
};

/**
 * Create paginated query schema
 * Combines pagination with custom filters
 * 
 * @param filterSchema - Additional filter schema
 * @returns {ZodSchema} Combined schema
 */
export function createPaginatedQuerySchema(filterSchema?: ZodSchema) {
  const baseSchema = commonSchemas.pagination;
  
  if (filterSchema) {
    return baseSchema.merge(filterSchema);
  }
  
  return baseSchema;
}

/**
 * Password validation schema
 * Enforces strong password requirements
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();