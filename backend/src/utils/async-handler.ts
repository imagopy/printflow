/**
 * Async Handler Utility
 * 
 * Wraps async route handlers to automatically catch errors
 * and pass them to Express error handling middleware.
 * 
 * @module utils/async-handler
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async function to handle errors automatically
 * 
 * @param fn - Async function to wrap
 * @returns Wrapped function that catches errors
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Type for async route handler functions
 */
export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;