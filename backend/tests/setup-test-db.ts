/**
 * Test Database Setup Script
 * 
 * Creates and configures the test database for integration tests.
 * Run this before running integration tests for the first time.
 * 
 * @module tests/setup-test-db
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

const TEST_DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/printflow_test';

async function setupTestDatabase() {
  console.log('🔧 Setting up test database...\n');

  // Extract database name from URL
  const dbName = TEST_DATABASE_URL.split('/').pop()?.split('?')[0] || 'printflow_test';
  const baseUrl = TEST_DATABASE_URL.substring(0, TEST_DATABASE_URL.lastIndexOf('/'));

  // Create a client connected to the default 'postgres' database
  const adminClient = new PrismaClient({
    datasources: {
      db: {
        url: `${baseUrl}/postgres`,
      },
    },
  });

  try {
    // Drop existing test database if it exists
    console.log(`📦 Dropping existing database '${dbName}' if it exists...`);
    try {
      await adminClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
      console.log('✅ Existing database dropped\n');
    } catch (error) {
      console.log('⚠️  Could not drop database (might not exist)\n');
    }

    // Create new test database
    console.log(`📦 Creating database '${dbName}'...`);
    await adminClient.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    console.log('✅ Database created\n');

    await adminClient.$disconnect();

    // Run Prisma migrations
    console.log('🔄 Running Prisma migrations...');
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
      },
    });
    console.log('✅ Migrations completed\n');

    // Generate Prisma client
    console.log('🔄 Generating Prisma client...');
    execSync('npx prisma generate', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
      },
    });
    console.log('✅ Prisma client generated\n');

    console.log('🎉 Test database setup complete!');
    console.log(`📍 Database URL: ${TEST_DATABASE_URL}\n`);

  } catch (error) {
    console.error('❌ Error setting up test database:', error);
    process.exit(1);
  } finally {
    await adminClient.$disconnect();
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupTestDatabase();
}