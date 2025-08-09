/**
 * Test Setup
 * 
 * Global setup for Jest tests including environment configuration
 * and test utilities.
 * 
 * @module tests/setup
 */

import { config } from 'dotenv';
import { prisma } from '../src/config/database';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_testing_only_32_chars';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging failed tests
  error: console.error,
};

// Increase timeout for database operations
jest.setTimeout(30000);

// Clean up database connections after all tests
afterAll(async () => {
  await prisma.$disconnect();
});