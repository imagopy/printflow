/**
 * Test Utilities
 * 
 * Common utilities and helpers for integration tests including
 * database setup, authentication, and test data factories.
 * 
 * @module tests/test-utils
 */

import { PrismaClient, UserRole, QuoteStatus, WorkOrderStatus } from '@prisma/client';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../src/config/env';

// Test database client
export const testDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/printflow_test',
    },
  },
});

/**
 * Clean all data from the test database
 */
export async function cleanDatabase(): Promise<void> {
  // Delete in correct order to respect foreign key constraints
  await testDb.workOrderStatusHistory.deleteMany();
  await testDb.workOrder.deleteMany();
  await testDb.quote.deleteMany();
  await testDb.product.deleteMany();
  await testDb.material.deleteMany();
  await testDb.customer.deleteMany();
  await testDb.user.deleteMany();
  await testDb.shop.deleteMany();
}

/**
 * Test data factories
 */
export const factories = {
  /**
   * Create a test shop
   */
  shop: (overrides?: Partial<any>) => ({
    id: uuidv4(),
    name: 'Test Print Shop',
    markup_percent: 40,
    labor_hourly_rate: 50,
    created_at: new Date(),
    ...overrides,
  }),

  /**
   * Create a test user
   */
  user: async (shopId: string, overrides?: Partial<any>) => ({
    id: uuidv4(),
    email: `test-${Date.now()}@example.com`,
    password_hash: await bcrypt.hash('password123', 10),
    role: UserRole.admin,
    shop_id: shopId,
    created_at: new Date(),
    ...overrides,
  }),

  /**
   * Create a test customer
   */
  customer: (shopId: string, overrides?: Partial<any>) => ({
    id: uuidv4(),
    name: 'Test Customer',
    email: 'customer@example.com',
    phone: '+1234567890',
    address: '123 Test St',
    shop_id: shopId,
    created_at: new Date(),
    ...overrides,
  }),

  /**
   * Create a test material
   */
  material: (shopId: string, overrides?: Partial<any>) => ({
    id: uuidv4(),
    name: 'Test Paper',
    cost_per_unit: 0.15,
    unit_type: 'sheet',
    supplier: 'Test Supplier',
    current_stock_level: 1000,
    shop_id: shopId,
    created_at: new Date(),
    ...overrides,
  }),

  /**
   * Create a test product
   */
  product: (shopId: string, materialId: string | null, overrides?: Partial<any>) => ({
    id: uuidv4(),
    name: 'Business Cards',
    category: 'cards',
    base_cost_formula: null,
    setup_cost: 25,
    setup_threshold: 100,
    estimated_hours: 0.5,
    material_id: materialId,
    active: true,
    shop_id: shopId,
    created_at: new Date(),
    ...overrides,
  }),

  /**
   * Create a test quote
   */
  quote: (shopId: string, customerId: string, userId: string, productId: string, overrides?: Partial<any>) => ({
    id: uuidv4(),
    customer_id: customerId,
    user_id: userId,
    product_id: productId,
    quantity: 500,
    specifications: {
      card_width_mm: 90,
      card_height_mm: 50,
      paper_type: 'glossy',
      colors: 4,
    },
    calculated_cost: 50.25,
    selling_price: 70.35,
    margin_percent: 28.57,
    status: QuoteStatus.draft,
    shop_id: shopId,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }),
};

/**
 * Create an authenticated request with JWT token
 */
export function createAuthenticatedRequest(
  user: { id: string; shop_id: string; role: UserRole },
  overrides?: Partial<Request>
): Partial<Request> {
  const token = jwt.sign(
    {
      userId: user.id,
      shopId: user.shop_id,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return {
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...overrides?.headers,
    },
    cookies: {
      token,
      ...overrides?.cookies,
    },
    ...overrides,
  } as Partial<Request>;
}

/**
 * Create a mock response object for testing
 */
export function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Setup test data for a complete scenario
 */
export async function setupTestScenario() {
  // Create shop
  const shop = await testDb.shop.create({
    data: factories.shop(),
  });

  // Create users
  const [adminUser, salesUser, productionUser] = await Promise.all([
    testDb.user.create({
      data: await factories.user(shop.id, { role: UserRole.admin }),
    }),
    testDb.user.create({
      data: await factories.user(shop.id, { 
        email: 'sales@example.com',
        role: UserRole.sales,
      }),
    }),
    testDb.user.create({
      data: await factories.user(shop.id, { 
        email: 'production@example.com',
        role: UserRole.production,
      }),
    }),
  ]);

  // Create material
  const material = await testDb.material.create({
    data: factories.material(shop.id),
  });

  // Create products
  const [businessCards, flyers] = await Promise.all([
    testDb.product.create({
      data: factories.product(shop.id, material.id, {
        name: 'Business Cards',
        category: 'cards',
      }),
    }),
    testDb.product.create({
      data: factories.product(shop.id, material.id, {
        name: 'Flyers',
        category: 'marketing',
        setup_cost: 50,
        setup_threshold: 500,
        estimated_hours: 1,
      }),
    }),
  ]);

  // Create customers
  const [customer1, customer2] = await Promise.all([
    testDb.customer.create({
      data: factories.customer(shop.id, {
        name: 'ABC Company',
        email: 'abc@example.com',
      }),
    }),
    testDb.customer.create({
      data: factories.customer(shop.id, {
        name: 'XYZ Corp',
        email: 'xyz@example.com',
      }),
    }),
  ]);

  return {
    shop,
    users: { adminUser, salesUser, productionUser },
    material,
    products: { businessCards, flyers },
    customers: { customer1, customer2 },
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}

/**
 * Extract error message from response
 */
export function getErrorMessage(response: any): string {
  return response.body?.error || response.body?.message || 'Unknown error';
}

/**
 * Assert that a date is close to now (within 1 minute)
 */
export function assertDateCloseToNow(date: Date | string, marginMs = 60000): void {
  const dateMs = new Date(date).getTime();
  const nowMs = Date.now();
  const diff = Math.abs(dateMs - nowMs);
  
  if (diff > marginMs) {
    throw new Error(`Date ${date} is not close to now (diff: ${diff}ms)`);
  }
}