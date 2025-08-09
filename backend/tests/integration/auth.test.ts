/**
 * Authentication Integration Tests
 * 
 * Tests authentication endpoints including login, register, logout,
 * token verification, and role-based access control.
 * 
 * @module tests/integration/auth
 */

import request from 'supertest';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../../src/server';
import { testDb, cleanDatabase, factories } from '../test-utils';

describe('Authentication API', () => {
  let testShop: any;

  beforeAll(async () => {
    await cleanDatabase();
    // Create a test shop
    testShop = await testDb.shop.create({
      data: factories.shop(),
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await testDb.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          name: 'New User',
          shopName: 'New Print Shop',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Registration successful');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user.email).toBe('newuser@example.com');
      expect(response.body.data.user.role).toBe(UserRole.admin);
      expect(response.body.data).toHaveProperty('shop');
      expect(response.body.data.shop.name).toBe('New Print Shop');

      // Verify user was created in database
      const user = await testDb.user.findUnique({
        where: { email: 'newuser@example.com' },
      });
      expect(user).toBeTruthy();
      expect(user?.role).toBe(UserRole.admin);
    });

    it('should reject registration with existing email', async () => {
      // Create existing user
      await testDb.user.create({
        data: await factories.user(testShop.id, {
          email: 'existing@example.com',
        }),
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'SecurePass123!',
          name: 'Duplicate User',
          shopName: 'Another Shop',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: '123', // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.details).toHaveLength(4); // email, password, name, shopName
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser: any;
    const testPassword = 'TestPass123!';

    beforeAll(async () => {
      testUser = await testDb.user.create({
        data: {
          ...await factories.user(testShop.id),
          email: 'login-test@example.com',
          password_hash: await bcrypt.hash(testPassword, 10),
        },
      });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@example.com',
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.id).toBe(testUser.id);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user.role).toBe(testUser.role);
      
      // Check for httpOnly cookie
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/token=.*; Max-Age=\d+; Path=\/; HttpOnly/);
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login-test@example.com',
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testPassword,
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should rate limit login attempts', async () => {
      // Make multiple rapid login attempts
      const attempts = Array(6).fill(null).map(() => 
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'login-test@example.com',
            password: 'WrongPassword',
          })
      );

      const responses = await Promise.all(attempts);
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('GET /api/auth/verify', () => {
    let authToken: string;
    let testUser: any;

    beforeAll(async () => {
      testUser = await testDb.user.create({
        data: await factories.user(testShop.id, {
          email: 'verify-test@example.com',
        }),
      });

      // Get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'verify-test@example.com',
          password: 'password123',
        });

      authToken = loginResponse.headers['set-cookie'][0].split(';')[0].split('=')[1];
    });

    it('should verify valid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Cookie', `token=${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.id).toBe(testUser.id);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data).toHaveProperty('shop');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Cookie', 'token=invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });

    it('should reject missing token', async () => {
      const response = await request(app)
        .get('/api/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logout successful');
      
      // Check cookie is cleared
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/token=; Max-Age=0/);
    });
  });

  describe('Role-Based Access Control', () => {
    let adminToken: string;
    let salesToken: string;
    let productionToken: string;

    beforeAll(async () => {
      // Create users with different roles
      const adminUser = await testDb.user.create({
        data: await factories.user(testShop.id, {
          email: 'admin@example.com',
          role: UserRole.admin,
        }),
      });

      const salesUser = await testDb.user.create({
        data: await factories.user(testShop.id, {
          email: 'sales@example.com',
          role: UserRole.sales,
        }),
      });

      const productionUser = await testDb.user.create({
        data: await factories.user(testShop.id, {
          email: 'production@example.com',
          role: UserRole.production,
        }),
      });

      // Get tokens for each user
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'password123' });
      adminToken = adminLogin.headers['set-cookie'][0].split(';')[0].split('=')[1];

      const salesLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'sales@example.com', password: 'password123' });
      salesToken = salesLogin.headers['set-cookie'][0].split(';')[0].split('=')[1];

      const productionLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'production@example.com', password: 'password123' });
      productionToken = productionLogin.headers['set-cookie'][0].split(';')[0].split('=')[1];
    });

    it('should allow admin access to admin-only endpoints', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Cookie', `token=${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('should allow sales access to sales endpoints', async () => {
      const response = await request(app)
        .get('/api/quotes')
        .set('Cookie', `token=${salesToken}`);

      expect(response.status).toBe(200);
    });

    it('should deny sales access to admin-only endpoints', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Cookie', `token=${salesToken}`)
        .send({
          name: 'Test Product',
          category: 'test',
          setup_cost: 10,
          setup_threshold: 100,
          estimated_hours: 1,
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Forbidden');
    });

    it('should deny production access to sales endpoints', async () => {
      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${productionToken}`)
        .send({
          customerId: 'test-id',
          productId: 'test-id',
          quantity: 100,
          specifications: {},
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Forbidden');
    });
  });

  describe('Password Change', () => {
    let testUser: any;
    let authToken: string;
    const oldPassword = 'OldPass123!';
    const newPassword = 'NewPass123!';

    beforeAll(async () => {
      testUser = await testDb.user.create({
        data: {
          ...await factories.user(testShop.id),
          email: 'password-change@example.com',
          password_hash: await bcrypt.hash(oldPassword, 10),
        },
      });

      // Get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'password-change@example.com',
          password: oldPassword,
        });

      authToken = loginResponse.headers['set-cookie'][0].split(';')[0].split('=')[1];
    });

    it('should change password successfully', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', `token=${authToken}`)
        .send({
          currentPassword: oldPassword,
          newPassword: newPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Password changed successfully');

      // Verify can login with new password
      const newLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'password-change@example.com',
          password: newPassword,
        });

      expect(newLoginResponse.status).toBe(200);
    });

    it('should reject password change with wrong current password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', `token=${authToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'AnotherPass123!',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Current password is incorrect');
    });
  });
});