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
 * Request validation middleware factory for body
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Get data to validate based on target
      const dataToValidate = req.body;

      // Parse and validate data
      const validatedData = schema.parse(dataToValidate);

      // Replace request data with validated data
      req.body = validatedData;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = formatZodError(error);

        logger.warn('Request validation failed', {
          target: 'body',
          errors: validationErrors,
          path: req.path,
          method: req.method,
        });

        next(new ValidationError('Validation failed', validationErrors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Request validation middleware factory for query
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateQuery<T extends z.ZodTypeAny>(
  schema: T
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Get data to validate based on target
      const dataToValidate = req.query;

      // Parse and validate data
      const validatedData = schema.parse(dataToValidate);

      // Replace request data with validated data
      req.query = validatedData;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = formatZodError(error);

        logger.warn('Request validation failed', {
          target: 'query',
          errors: validationErrors,
          path: req.path,
          method: req.method,
        });

        next(new ValidationError('Validation failed', validationErrors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Request validation middleware factory for params
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateParams<T extends z.ZodTypeAny>(
  schema: T
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Get data to validate based on target
      const dataToValidate = req.params;

      // Parse and validate data
      const validatedData = schema.parse(dataToValidate);

      // Replace request data with validated data
      req.params = validatedData;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = formatZodError(error);

        logger.warn('Request validation failed', {
          target: 'params',
          errors: validationErrors,
          path: req.path,
          method: req.method,
        });

        next(new ValidationError('Validation failed', validationErrors));
      } else {
        next(error);
      }
    }
  };
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
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
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
 * Options for file validation
 */
export interface FileValidationOptions {
  mimeTypes?: string[];
  maxSize?: number;
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid('Invalid ID format'),
  
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  
  // Sorting
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  
  // Date range
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  
  // Search
  search: z.string().trim().optional(),
};

/**
 * Create a paginated query schema
 * Combines pagination with custom filters
 * 
 * @param filterSchema - Additional filter schema
 * @returns Combined schema
 */
export function createPaginatedQuerySchema<T extends z.ZodRawShape>(
  filterSchema?: z.ZodObject<T>
): z.ZodObject<z.ZodRawShape> {
  const baseSchema = z.object({
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    sortBy: commonSchemas.sortBy,
    sortOrder: commonSchemas.sortOrder,
  });
  
  if (filterSchema) {
    return baseSchema.merge(filterSchema) as z.ZodObject<z.ZodRawShape>;
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

/**
 * File upload validation middleware
 * 
 * @param options - Validation options
 * @returns Express middleware
 */
export function validateFile(options: FileValidationOptions): (req: Request, _res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      const { mimeTypes, maxSize } = options;
      const file = req.file;

      // Validate file type
      if (mimeTypes && !mimeTypes.includes(file.mimetype)) {
        throw new ValidationError(
          `Invalid file type. Allowed types: ${mimeTypes.join(', ')}`
        );
      }

      // Validate file size
      if (maxSize && file.size > maxSize) {
        const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
        throw new ValidationError(
          `File too large. Maximum size: ${maxSizeMB}MB`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}