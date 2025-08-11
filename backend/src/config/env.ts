/**
 * Environment Configuration Module
 * 
 * Centralizes all environment variable access with type safety and validation.
 * Ensures required variables are present at startup to fail fast.
 * 
 * @module config/env
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

/**
 * Environment variable schema definition
 * Validates and transforms environment variables into typed configuration
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.string().transform(Number).default('20'),

  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // Email Service - SendGrid
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_FROM_NAME: z.string().optional(),

  // Email Service - AWS SES
  AWS_SES_REGION: z.string().optional(),
  AWS_SES_ACCESS_KEY_ID: z.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SES_FROM_EMAIL: z.string().email().optional(),

  // File Storage - AWS S3
  S3_BUCKET: z.string(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_REGION: z.string().optional(),
  AWS_S3_PUBLIC_URL: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_REGION: z.string().default('us-east-1'),

  // File Storage - CloudFlare R2
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),

  // PDF Generation
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  PDF_STORAGE_PATH: z.string().default('./temp/pdfs'),

  // Company Information
  COMPANY_NAME: z.string().default('PrintFlow'),
  COMPANY_ADDRESS: z.string().optional(),
  COMPANY_PHONE: z.string().optional(),
  COMPANY_EMAIL: z.string().email().optional(),
  COMPANY_WEBSITE: z.string().url().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Optional: Error Tracking
  SENTRY_DSN: z.string().optional(),
});

/**
 * Validates environment variables and returns typed configuration
 * Throws error if required variables are missing or invalid
 */
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Environment validation failed:\n${missing.join('\n')}`);
    }
    throw error;
  }
}

/**
 * Validated and typed environment configuration
 * @constant
 */
export const env = validateEnv();

/**
 * Type definition for environment configuration
 * Use this type when passing config to functions
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Check if running in production environment
 * @returns {boolean} True if NODE_ENV is 'production'
 */
export const isProduction = (): boolean => env.NODE_ENV === 'production';

/**
 * Check if running in development environment
 * @returns {boolean} True if NODE_ENV is 'development'
 */
export const isDevelopment = (): boolean => env.NODE_ENV === 'development';

/**
 * Check if running in test environment
 * @returns {boolean} True if NODE_ENV is 'test'
 */
export const isTest = (): boolean => env.NODE_ENV === 'test';

/**
 * Get database connection options with proper SSL configuration
 * @returns {object} Database connection options
 */
export const getDatabaseOptions = () => ({
  url: env.DATABASE_URL,
  pool: {
    max: env.DATABASE_POOL_SIZE,
    min: 2,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
  ssl: isProduction() ? { rejectUnauthorized: false } : false,
});