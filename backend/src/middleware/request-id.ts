/**
 * Request ID Middleware
 * 
 * Generates unique request IDs for tracing and correlation.
 * Helps with debugging and log aggregation across services.
 * 
 * @module middleware/request-id
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID header name
 */
const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Extend Express Request to include requestId
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Request ID middleware
 * Generates or extracts request ID and attaches to request
 * 
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if request ID already exists in headers (from proxy/load balancer)
  const existingRequestId = req.headers[REQUEST_ID_HEADER.toLowerCase()] as string;
  
  // Generate new ID if not present
  const id = existingRequestId || randomUUID();
  
  // Attach to request object
  req.requestId = id;
  
  // Add to response headers for client correlation
  res.setHeader(REQUEST_ID_HEADER, id);
  
  next();
}

/**
 * Get request ID from request
 * Safe getter with fallback
 * 
 * @param req - Express request
 * @returns {string} Request ID
 */
export function getRequestId(req: Request): string {
  return req.requestId || 'unknown';
}

/**
 * Request logging middleware
 * Logs request details with request ID
 * 
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  
  // Log request
  console.log(`[${req.requestId}] ${req.method} ${req.path} - Started`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${req.requestId}] ${req.method} ${req.path} - Completed ${res.statusCode} in ${duration}ms`
    );
  });
  
  next();
}