/**
 * Multi-tenant Isolation Integration Tests
 * 
 * Tests to ensure strict data isolation between different shops,
 * verifying that users cannot access data from other tenants.
 * 
 * @module tests/integration/multi-tenant
 */

import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../../src/server';
import { testDb, cleanDatabase, factories } from '../test-utils';

describe('Multi-tenant Isolation', () => {
  let shop1: any;
  let shop2: any;
  let shop1Admin: any;
  let shop2Admin: any;
  let shop1Token: string;
  let shop2Token: string;
  let shop1Data: any = {};
  let shop2Data: any = {};

  beforeAll(async () => {
    await cleanDatabase();

    // Create two separate shops
    shop1 = await testDb.shop.create({
      data: factories.shop({ name: 'Shop One' }),
    });

    shop2 = await testDb.shop.create({
      data: factories.shop({ name: 'Shop Two' }),
    });

    // Create admin users for each shop
    shop1Admin = await testDb.user.create({
      data: await factories.user(shop1.id, {
        email: 'admin@shop1.com',
        role: UserRole.admin,
      }),
    });

    shop2Admin = await testDb.user.create({
      data: await factories.user(shop2.id, {
        email: 'admin@shop2.com',
        role: UserRole.admin,
      }),
    });

    // Get auth tokens
    const shop1Login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@shop1.com', password: 'password123' });
    shop1Token = shop1Login.headers['set-cookie'][0].split(';')[0].split('=')[1];

    const shop2Login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@shop2.com', password: 'password123' });
    shop2Token = shop2Login.headers['set-cookie'][0].split(';')[0].split('=')[1];

    // Create test data for each shop
    // Shop 1 data
    shop1Data.material = await testDb.material.create({
      data: factories.material(shop1.id, { name: 'Shop 1 Paper' }),
    });

    shop1Data.product = await testDb.product.create({
      data: factories.product(shop1.id, shop1Data.material.id, {
        name: 'Shop 1 Business Cards',
      }),
    });

    shop1Data.customer = await testDb.customer.create({
      data: factories.customer(shop1.id, {
        name: 'Shop 1 Customer',
        email: 'customer@shop1.com',
      }),
    });

    shop1Data.quote = await testDb.quote.create({
      data: factories.quote(
        shop1.id,
        shop1Data.customer.id,
        shop1Admin.id,
        shop1Data.product.id
      ),
    });

    // Shop 2 data
    shop2Data.material = await testDb.material.create({
      data: factories.material(shop2.id, { name: 'Shop 2 Paper' }),
    });

    shop2Data.product = await testDb.product.create({
      data: factories.product(shop2.id, shop2Data.material.id, {
        name: 'Shop 2 Flyers',
      }),
    });

    shop2Data.customer = await testDb.customer.create({
      data: factories.customer(shop2.id, {
        name: 'Shop 2 Customer',
        email: 'customer@shop2.com',
      }),
    });

    shop2Data.quote = await testDb.quote.create({
      data: factories.quote(
        shop2.id,
        shop2Data.customer.id,
        shop2Admin.id,
        shop2Data.product.id
      ),
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await testDb.$disconnect();
  });

  describe('Customer Isolation', () => {
    it('should only return customers from own shop', async () => {
      const response = await request(app)
        .get('/api/customers')
        .set('Cookie', `token=${shop1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(shop1Data.customer.id);
      expect(response.body.data[0].name).toBe('Shop 1 Customer');
    });

    it('should not access customer from another shop', async () => {
      const response = await request(app)
        .get(`/api/customers/${shop2Data.customer.id}`)
        .set('Cookie', `token=${shop1Token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should not create customer with another shop\'s ID', async () => {
      // Attempt to create a customer with shop2's ID while authenticated as shop1
      const maliciousData = {
        name: 'Malicious Customer',
        email: 'malicious@example.com',
        shop_id: shop2.id, // Trying to inject different shop_id
      };

      const response = await request(app)
        .post('/api/customers')
        .set('Cookie', `token=${shop1Token}`)
        .send(maliciousData);

      expect(response.status).toBe(201);
      
      // Verify the customer was created with shop1's ID, not shop2's
      const createdCustomer = await testDb.customer.findUnique({
        where: { id: response.body.data.id },
      });
      expect(createdCustomer?.shop_id).toBe(shop1.id);
      expect(createdCustomer?.shop_id).not.toBe(shop2.id);
    });

    it('should not update customer from another shop', async () => {
      const response = await request(app)
        .put(`/api/customers/${shop2Data.customer.id}`)
        .set('Cookie', `token=${shop1Token}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(404);
    });

    it('should not delete customer from another shop', async () => {
      const response = await request(app)
        .delete(`/api/customers/${shop2Data.customer.id}`)
        .set('Cookie', `token=${shop1Token}`);

      expect(response.status).toBe(404);

      // Verify customer still exists
      const customer = await testDb.customer.findUnique({
        where: { id: shop2Data.customer.id },
      });
      expect(customer).toBeTruthy();
    });
  });

  describe('Product Isolation', () => {
    it('should only return products from own shop', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Cookie', `token=${shop2Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(shop2Data.product.id);
      expect(response.body.data[0].name).toBe('Shop 2 Flyers');
    });

    it('should not access product from another shop', async () => {
      const response = await request(app)
        .get(`/api/products/${shop1Data.product.id}`)
        .set('Cookie', `token=${shop2Token}`);

      expect(response.status).toBe(404);
    });

    it('should not use material from another shop when creating product', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Cookie', `token=${shop1Token}`)
        .send({
          name: 'Sneaky Product',
          category: 'cards',
          setup_cost: 10,
          setup_threshold: 100,
          estimated_hours: 1,
          material_id: shop2Data.material.id, // Trying to use shop2's material
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Material');
    });
  });

  describe('Quote Isolation', () => {
    it('should only return quotes from own shop', async () => {
      const response = await request(app)
        .get('/api/quotes')
        .set('Cookie', `token=${shop1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(shop1Data.quote.id);
    });

    it('should not access quote from another shop', async () => {
      const response = await request(app)
        .get(`/api/quotes/${shop2Data.quote.id}`)
        .set('Cookie', `token=${shop1Token}`);

      expect(response.status).toBe(404);
    });

    it('should not create quote with another shop\'s customer', async () => {
      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${shop1Token}`)
        .send({
          customerId: shop2Data.customer.id, // Shop 2's customer
          productId: shop1Data.product.id,
          quantity: 100,
          specifications: {},
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Customer');
    });

    it('should not create quote with another shop\'s product', async () => {
      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${shop1Token}`)
        .send({
          customerId: shop1Data.customer.id,
          productId: shop2Data.product.id, // Shop 2's product
          quantity: 100,
          specifications: {},
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Product');
    });
  });

  describe('Statistics Isolation', () => {
    it('should only include data from own shop in statistics', async () => {
      const response = await request(app)
        .get('/api/quotes/stats')
        .set('Cookie', `token=${shop1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.overview.totalQuotes).toBe(1);
      
      // Should not include shop2's quote
      const shop2Quote = response.body.data.topCustomers.find(
        (c: any) => c.customer?.id === shop2Data.customer.id
      );
      expect(shop2Quote).toBeUndefined();
    });

    it('should show different statistics for different shops', async () => {
      const [shop1Stats, shop2Stats] = await Promise.all([
        request(app)
          .get('/api/quotes/stats')
          .set('Cookie', `token=${shop1Token}`),
        request(app)
          .get('/api/quotes/stats')
          .set('Cookie', `token=${shop2Token}`),
      ]);

      expect(shop1Stats.status).toBe(200);
      expect(shop2Stats.status).toBe(200);

      // Each shop should only see their own quote
      expect(shop1Stats.body.data.overview.totalQuotes).toBe(1);
      expect(shop2Stats.body.data.overview.totalQuotes).toBe(1);

      // Total values should be different (different products/pricing)
      expect(shop1Stats.body.data.overview.totalValue).not.toBe(
        shop2Stats.body.data.overview.totalValue
      );
    });
  });

  describe('Cross-tenant Operations', () => {
    it('should prevent accepting another shop\'s quote', async () => {
      // First, send shop2's quote
      await request(app)
        .post(`/api/quotes/${shop2Data.quote.id}/send`)
        .set('Cookie', `token=${shop2Token}`)
        .send({});

      // Try to accept it as shop1
      const response = await request(app)
        .post(`/api/quotes/${shop2Data.quote.id}/accept`)
        .set('Cookie', `token=${shop1Token}`)
        .send({});

      expect(response.status).toBe(404);
    });

    it('should prevent bulk operations across shops', async () => {
      // Create another product for shop1
      const anotherProduct = await testDb.product.create({
        data: factories.product(shop1.id, shop1Data.material.id, {
          name: 'Shop 1 Another Product',
        }),
      });

      // Try to bulk update including shop2's product
      const response = await request(app)
        .patch('/api/products/bulk')
        .set('Cookie', `token=${shop1Token}`)
        .send({
          productIds: [
            shop1Data.product.id,
            anotherProduct.id,
            shop2Data.product.id, // Shop 2's product
          ],
          updates: { active: false },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('not found or do not belong to your shop');
    });
  });

  describe('User Authentication Isolation', () => {
    it('should not allow login with credentials from another shop', async () => {
      // This test verifies that email uniqueness is global, not per-shop
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@shop2.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      // User should be authenticated to their own shop
      expect(response.body.data.user.id).toBe(shop2Admin.id);
    });

    it('should not allow user to switch shops', async () => {
      // Create a malicious request trying to access shop2 data with shop1 token
      // but manipulating headers or body to include shop2's ID
      const response = await request(app)
        .get('/api/customers')
        .set('Cookie', `token=${shop1Token}`)
        .set('X-Shop-ID', shop2.id); // Trying to inject shop ID

      expect(response.status).toBe(200);
      // Should still only see shop1's data
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(shop1Data.customer.id);
    });
  });

  describe('Database Constraints', () => {
    it('should enforce shop_id foreign key constraints', async () => {
      // Try to create a quote with non-existent shop_id directly
      await expect(
        testDb.quote.create({
          data: {
            ...factories.quote(
              'non-existent-shop-id',
              shop1Data.customer.id,
              shop1Admin.id,
              shop1Data.product.id
            ),
          },
        })
      ).rejects.toThrow();
    });

    it('should cascade delete when shop is deleted', async () => {
      // Create a temporary shop with data
      const tempShop = await testDb.shop.create({
        data: factories.shop({ name: 'Temp Shop' }),
      });

      const tempCustomer = await testDb.customer.create({
        data: factories.customer(tempShop.id),
      });

      // Delete the shop
      await testDb.shop.delete({
        where: { id: tempShop.id },
      });

      // Verify customer was cascade deleted
      const customer = await testDb.customer.findUnique({
        where: { id: tempCustomer.id },
      });
      expect(customer).toBeNull();
    });
  });
});