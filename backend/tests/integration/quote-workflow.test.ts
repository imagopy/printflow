/**
 * Quote Workflow Integration Tests
 * 
 * Tests the complete quote workflow from creation through acceptance
 * and work order generation, including pricing calculations.
 * 
 * @module tests/integration/quote-workflow
 */

import request from 'supertest';
import { QuoteStatus, WorkOrderStatus } from '@prisma/client';
import app from '../../src/server';
import { testDb, cleanDatabase, setupTestScenario } from '../test-utils';

describe('Quote Workflow', () => {
  let testData: any;
  let adminToken: string;
  let salesToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    testData = await setupTestScenario();

    // Get auth tokens
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: testData.users.adminUser.email, password: 'password123' });
    adminToken = adminLogin.headers['set-cookie'][0].split(';')[0].split('=')[1];

    const salesLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: testData.users.salesUser.email, password: 'password123' });
    salesToken = salesLogin.headers['set-cookie'][0].split(';')[0].split('=')[1];
  });

  afterAll(async () => {
    await cleanDatabase();
    await testDb.$disconnect();
  });

  describe('Quote Creation with Pricing', () => {
    it('should create a quote with correct pricing calculations', async () => {
      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${salesToken}`)
        .send({
          customerId: testData.customers.customer1.id,
          productId: testData.products.businessCards.id,
          quantity: 500,
          specifications: {
            card_width_mm: 90,
            card_height_mm: 50,
            paper_type: 'glossy',
            colors: 4,
            sheet_width_mm: 450,
            sheet_height_mm: 320,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        customer_id: testData.customers.customer1.id,
        product_id: testData.products.businessCards.id,
        quantity: 500,
        status: QuoteStatus.draft,
      });

      // Verify pricing calculations
      const pricing = response.body.pricing;
      expect(pricing).toBeDefined();
      expect(pricing.breakdown.cardsPerSheet).toBe(35); // (450/90) * (320/50)
      expect(pricing.breakdown.sheetsNeeded).toBe(15); // ceil(500/35)
      expect(pricing.materialCost).toBeCloseTo(2.25); // 15 * 0.15
      expect(pricing.setupCost).toBe(0); // 500 > 100 threshold
      expect(pricing.laborCost).toBe(25); // 0.5 hours * 50/hour
      expect(pricing.totalCost).toBeCloseTo(27.25);
      expect(pricing.sellingPrice).toBeCloseTo(38.15); // 27.25 * 1.4 (40% markup)
    });

    it('should apply setup costs for small quantities', async () => {
      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${salesToken}`)
        .send({
          customerId: testData.customers.customer1.id,
          productId: testData.products.businessCards.id,
          quantity: 50, // Below threshold of 100
          specifications: {
            card_width_mm: 90,
            card_height_mm: 50,
            sheet_width_mm: 450,
            sheet_height_mm: 320,
          },
        });

      expect(response.status).toBe(201);
      const pricing = response.body.pricing;
      expect(pricing.setupCost).toBe(25); // Setup cost applied
      expect(pricing.totalCost).toBeGreaterThan(pricing.materialCost + pricing.laborCost);
    });

    it('should preview pricing without saving', async () => {
      const response = await request(app)
        .post('/api/quotes/preview')
        .set('Cookie', `token=${salesToken}`)
        .send({
          productId: testData.products.flyers.id,
          quantity: 1000,
          specifications: {
            width_mm: 210,
            height_mm: 297,
            paper_type: 'matte',
            folded: false,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.pricing).toBeDefined();
      
      // Verify quote was not saved
      const quotes = await testDb.quote.findMany({
        where: { product_id: testData.products.flyers.id },
      });
      expect(quotes.filter(q => q.quantity === 1000).length).toBe(0);
    });

    it('should validate specifications for product category', async () => {
      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${salesToken}`)
        .send({
          customerId: testData.customers.customer1.id,
          productId: testData.products.businessCards.id,
          quantity: 500,
          specifications: {
            // Missing required fields for business cards
            paper_type: 'glossy',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required specifications');
    });
  });

  describe('Quote Management', () => {
    let createdQuote: any;

    beforeAll(async () => {
      // Create a test quote
      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${salesToken}`)
        .send({
          customerId: testData.customers.customer1.id,
          productId: testData.products.businessCards.id,
          quantity: 1000,
          specifications: {
            card_width_mm: 90,
            card_height_mm: 50,
            sheet_width_mm: 450,
            sheet_height_mm: 320,
          },
        });
      createdQuote = response.body.data;
    });

    it('should list quotes with filters', async () => {
      const response = await request(app)
        .get('/api/quotes')
        .set('Cookie', `token=${salesToken}`)
        .query({
          status: QuoteStatus.draft,
          customerId: testData.customers.customer1.id,
          page: 1,
          pageSize: 10,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.data[0]).toHaveProperty('customer');
      expect(response.body.data[0]).toHaveProperty('product');
    });

    it('should update quote details', async () => {
      const response = await request(app)
        .put(`/api/quotes/${createdQuote.id}`)
        .set('Cookie', `token=${salesToken}`)
        .send({
          quantity: 2000,
          specifications: {
            card_width_mm: 90,
            card_height_mm: 50,
            sheet_width_mm: 450,
            sheet_height_mm: 320,
            paper_type: 'matte', // Changed
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.quantity).toBe(2000);
      expect(response.body.data.specifications.paper_type).toBe('matte');
      // Pricing should be recalculated
      expect(response.body.data.selling_price).not.toBe(createdQuote.selling_price);
    });

    it('should send quote to customer', async () => {
      const response = await request(app)
        .post(`/api/quotes/${createdQuote.id}/send`)
        .set('Cookie', `token=${salesToken}`)
        .send({
          message: 'Please find attached your quote.',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Quote sent successfully');

      // Verify status changed to sent
      const quote = await testDb.quote.findUnique({
        where: { id: createdQuote.id },
      });
      expect(quote?.status).toBe(QuoteStatus.sent);
    });

    it('should not allow editing sent quotes', async () => {
      const response = await request(app)
        .put(`/api/quotes/${createdQuote.id}`)
        .set('Cookie', `token=${salesToken}`)
        .send({
          quantity: 3000,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot edit sent quotes');
    });
  });

  describe('Quote to Work Order Conversion', () => {
    let sentQuote: any;

    beforeAll(async () => {
      // Create and send a quote
      const createResponse = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${salesToken}`)
        .send({
          customerId: testData.customers.customer2.id,
          productId: testData.products.flyers.id,
          quantity: 5000,
          specifications: {
            width_mm: 210,
            height_mm: 297,
            paper_type: 'glossy',
            folded: true,
          },
        });

      sentQuote = createResponse.body.data;

      await request(app)
        .post(`/api/quotes/${sentQuote.id}/send`)
        .set('Cookie', `token=${salesToken}`)
        .send({});
    });

    it('should accept quote and create work order', async () => {
      const response = await request(app)
        .post(`/api/quotes/${sentQuote.id}/accept`)
        .set('Cookie', `token=${salesToken}`)
        .send({
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          notes: 'Rush order - customer needs by Friday',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Quote accepted successfully');
      expect(response.body.data.quote.status).toBe(QuoteStatus.accepted);
      expect(response.body.data.workOrder).toBeDefined();
      expect(response.body.data.workOrder.status).toBe(WorkOrderStatus.pending);
      expect(response.body.data.workOrder.quote_id).toBe(sentQuote.id);

      // Verify work order was created
      const workOrder = await testDb.workOrder.findUnique({
        where: { quote_id: sentQuote.id },
        include: { status_history: true },
      });

      expect(workOrder).toBeTruthy();
      expect(workOrder?.production_notes).toBe('Rush order - customer needs by Friday');
      expect(workOrder?.status_history.length).toBe(1);
      expect(workOrder?.status_history[0].status).toBe(WorkOrderStatus.pending);

      // Verify customer last order date was updated
      const customer = await testDb.customer.findUnique({
        where: { id: testData.customers.customer2.id },
      });
      expect(customer?.last_order_date).toBeTruthy();
    });

    it('should not allow accepting already accepted quote', async () => {
      const response = await request(app)
        .post(`/api/quotes/${sentQuote.id}/accept`)
        .set('Cookie', `token=${salesToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Quote has already been accepted');
    });

    it('should reject quote', async () => {
      // Create another quote to reject
      const createResponse = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${salesToken}`)
        .send({
          customerId: testData.customers.customer1.id,
          productId: testData.products.businessCards.id,
          quantity: 100,
          specifications: {
            card_width_mm: 90,
            card_height_mm: 50,
            sheet_width_mm: 450,
            sheet_height_mm: 320,
          },
        });

      const quoteToReject = createResponse.body.data;

      // Send it first
      await request(app)
        .post(`/api/quotes/${quoteToReject.id}/send`)
        .set('Cookie', `token=${salesToken}`)
        .send({});

      // Now reject it
      const rejectResponse = await request(app)
        .post(`/api/quotes/${quoteToReject.id}/reject`)
        .set('Cookie', `token=${salesToken}`)
        .send({
          reason: 'Price too high',
          allowRevision: true,
        });

      expect(rejectResponse.status).toBe(200);
      expect(rejectResponse.body.message).toBe('Quote rejected');
      expect(rejectResponse.body.data.status).toBe(QuoteStatus.rejected);
    });
  });

  describe('Quote Statistics', () => {
    it('should return quote statistics', async () => {
      const response = await request(app)
        .get('/api/quotes/stats')
        .set('Cookie', `token=${adminToken}`)
        .query({
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('overview');
      expect(response.body.data).toHaveProperty('byStatus');
      expect(response.body.data).toHaveProperty('topProducts');
      expect(response.body.data).toHaveProperty('topCustomers');
      expect(response.body.data).toHaveProperty('conversionRate');

      // Verify calculations
      const { overview, byStatus } = response.body.data;
      expect(overview.totalQuotes).toBeGreaterThan(0);
      expect(overview.totalValue).toBeGreaterThan(0);
      expect(overview.totalProfit).toBe(overview.totalValue - overview.totalCost);
    });
  });

  describe('Quote Permissions', () => {
    it('should allow sales to create quotes', async () => {
      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${salesToken}`)
        .send({
          customerId: testData.customers.customer1.id,
          productId: testData.products.businessCards.id,
          quantity: 250,
          specifications: {
            card_width_mm: 90,
            card_height_mm: 50,
            sheet_width_mm: 450,
            sheet_height_mm: 320,
          },
        });

      expect(response.status).toBe(201);
    });

    it('should deny production users from creating quotes', async () => {
      const productionLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: testData.users.productionUser.email, password: 'password123' });
      const productionToken = productionLogin.headers['set-cookie'][0].split(';')[0].split('=')[1];

      const response = await request(app)
        .post('/api/quotes')
        .set('Cookie', `token=${productionToken}`)
        .send({
          customerId: testData.customers.customer1.id,
          productId: testData.products.businessCards.id,
          quantity: 250,
          specifications: {},
        });

      expect(response.status).toBe(403);
    });

    it('should allow production users to view quotes', async () => {
      const productionLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: testData.users.productionUser.email, password: 'password123' });
      const productionToken = productionLogin.headers['set-cookie'][0].split(';')[0].split('=')[1];

      const response = await request(app)
        .get('/api/quotes')
        .set('Cookie', `token=${productionToken}`);

      expect(response.status).toBe(200);
    });
  });
});