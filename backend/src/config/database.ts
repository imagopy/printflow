/**
 * Database Configuration and Prisma Client
 * 
 * Manages database connection lifecycle and provides typed Prisma client.
 * Implements connection pooling and graceful shutdown.
 * 
 * @module config/database
 */

import { PrismaClient } from '@prisma/client';
import { isDevelopment } from './env';

/**
 * Extended Prisma Client with logging configuration
 * Logs queries in development for debugging
 */
const prismaClientSingleton = (): PrismaClient => {
  return new PrismaClient({
    log: isDevelopment() 
      ? ['query', 'info', 'warn', 'error'] 
      : ['error'],
    errorFormat: isDevelopment() ? 'pretty' : 'minimal',
  });
};

// Declare global type for Prisma client singleton
declare global {
  // eslint-disable-next-line no-var
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

/**
 * Prisma client instance
 * Uses singleton pattern to prevent multiple instances in development
 * 
 * @constant
 */
export const prisma = globalThis.prisma ?? prismaClientSingleton();

/**
 * Alias for prisma client for backward compatibility
 * @constant
 */
export const db = prisma;

// Store prisma instance in global for development hot-reloading
if (isDevelopment()) {
  globalThis.prisma = prisma;
}

/**
 * Connect to database
 * Should be called once during application startup
 * 
 * @returns {Promise<void>}
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

/**
 * Disconnect from database
 * Should be called during graceful shutdown
 * 
 * @returns {Promise<void>}
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  } catch (error) {
    console.error('❌ Database disconnection failed:', error);
    throw error;
  }
}

/**
 * Health check for database connection
 * Used by health check endpoints
 * 
 * @returns {Promise<boolean>} True if database is healthy
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a database transaction with automatic retry on deadlock
 * 
 * @param fn - Transaction function to execute
 * @param maxRetries - Maximum number of retry attempts
 * @returns {Promise<T>} Result of transaction function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable (deadlock, connection issues)
      const isRetryable = 
        lastError.message.includes('deadlock') ||
        lastError.message.includes('connection') ||
        lastError.message.includes('timeout');
        
      if (!isRetryable || i === maxRetries - 1) {
        throw lastError;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100));
    }
  }
  
  throw lastError;
}