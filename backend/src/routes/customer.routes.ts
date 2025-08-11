/**
 * Customer Routes
 * 
 * API endpoints for customer management including
 * CRUD operations, search, and customer statistics.
 * 
 * @module routes/customer
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantIsolation, TenantRequest } from '../middleware/tenant';
import { 
  validateBody, 
  validateQuery, 
  validateParams,
  commonSchemas 
} from '../middleware/validation';
import { asyncHandler } from '../middleware/error-handler';
import { writeLimiter } from '../middleware/rate-limit';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersSchema,
} from '../validators/customer.validators';
import { NotFoundError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const router = Router();

// Apply authentication and tenant isolation to all routes
router.use(authenticate);
router.use(tenantIsolation);

/**
 * List customers with pagination and filtering
 * 
 * GET /customers
 */
router.get(
  '/',
  requireRole('admin', 'sales'),
  validateQuery(listCustomersSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;
    const query = req.query as z.infer<typeof listCustomersSchema>;

    // Build where clause with filters
    const where: Prisma.CustomerWhereInput = { shop_id: tenant.shopId };

    // Search filter
    if ('search' in query && query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Email/phone filters
    if ('hasEmail' in query && query.hasEmail !== undefined) {
      where.email = query.hasEmail ? { not: null } : null;
    }
    if ('hasPhone' in query && query.hasPhone !== undefined) {
      where.phone = query.hasPhone ? { not: null } : null;
    }

    // Date filters
    if (('lastOrderAfter' in query && query.lastOrderAfter) || ('lastOrderBefore' in query && query.lastOrderBefore)) {
      where.last_order_date = {};
      if ('lastOrderAfter' in query && query.lastOrderAfter) {
        where.last_order_date.gte = new Date(query.lastOrderAfter);
      }
      if ('lastOrderBefore' in query && query.lastOrderBefore) {
        where.last_order_date.lte = new Date(query.lastOrderBefore);
      }
    }

    if (('createdAfter' in query && query.createdAfter) || ('createdBefore' in query && query.createdBefore)) {
      where.created_at = {};
      if ('createdAfter' in query && query.createdAfter) {
        where.created_at.gte = new Date(query.createdAfter);
      }
      if ('createdBefore' in query && query.createdBefore) {
        where.created_at.lte = new Date(query.createdBefore);
      }
    }

    // Pagination
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // Sorting
    const orderBy: Prisma.CustomerOrderByWithRelationInput = {};
    if (query.sortBy) {
      orderBy[query.sortBy as keyof Prisma.CustomerOrderByWithRelationInput] = 
        query.sortOrder || 'asc';
    } else {
      orderBy.created_at = 'desc';
    }

    // Execute query with count
    const [customers, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          _count: {
            select: { quotes: true },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({
      data: customers,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  })
);

/**
 * Get customer by ID
 * 
 * GET /customers/:id
 */
router.get(
  '/:id',
  requireRole('admin', 'sales'),
  validateParams(commonSchemas.uuid),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;
    const { id } = req.params;

    const customer = await prisma.customer.findFirst({
      where: tenant.scope({ id }),
      include: {
        quotes: {
          orderBy: { created_at: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            selling_price: true,
            created_at: true,
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: { quotes: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Customer', id);
    }

    res.json({ data: customer });
  })
);

/**
 * Create new customer
 * 
 * POST /customers
 */
router.post(
  '/',
  requireRole('admin', 'sales'),
  writeLimiter,
  validateBody(createCustomerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const data = req.body as z.infer<typeof createCustomerSchema>;

    // Check for duplicate email within shop
    if (data.email) {
      const existingCustomer = await prisma.customer.findFirst({
        where: tenant.scope({
          email: data.email.toLowerCase(),
        }),
      });

      if (existingCustomer) {
        throw new ConflictError('A customer with this email already exists');
      }
    }

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        shop_id: tenant.shopId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        created_at: true,
        shop_id: true,
      },
    });

    logger.info('Customer created', {
      customerId: customer.id,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.status(201).json({ 
      data: customer,
      message: 'Customer created successfully',
    });
  })
);

/**
 * Update customer
 * 
 * PUT /customers/:id
 */
router.put(
  '/:id',
  requireRole('admin', 'sales'),
  writeLimiter,
  validateParams(commonSchemas.uuid),
  validateBody(updateCustomerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { id } = req.params;
    const data = req.body as z.infer<typeof updateCustomerSchema>;

    // Check if customer exists
    const existingCustomer = await prisma.customer.findFirst({
      where: tenant.scope({ id }),
    });

    if (!existingCustomer) {
      throw new NotFoundError('Customer', id);
    }

    // Check for duplicate email if updating
    if (data.email && data.email !== existingCustomer.email) {
      const duplicateCustomer = await prisma.customer.findFirst({
        where: tenant.scope({
          email: data.email.toLowerCase(),
          id: { not: id },
        }),
      });

      if (duplicateCustomer) {
        throw new ConflictError('A customer with this email already exists');
      }
    }

    // Update customer
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.address !== undefined && { address: data.address }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        created_at: true,
        shop_id: true,
      },
    });

    logger.info('Customer updated', {
      customerId: customer.id,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.json({ 
      data: customer,
      message: 'Customer updated successfully',
    });
  })
);

/**
 * Delete customer
 * 
 * DELETE /customers/:id
 */
router.delete(
  '/:id',
  requireRole('admin'),
  validateParams(commonSchemas.uuid),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { id } = req.params;

    // Check if customer exists
    const customer = await prisma.customer.findFirst({
      where: tenant.scope({ id }),
      include: {
        _count: {
          select: { quotes: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Customer', id);
    }

    // Prevent deletion if customer has quotes
    if (customer._count.quotes > 0) {
      throw new ConflictError(
        `Cannot delete customer with ${customer._count.quotes} quotes. Archive instead.`
      );
    }

    // Delete customer
    await prisma.customer.delete({
      where: { id },
    });

    logger.info('Customer deleted', {
      customerId: id,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.json({ 
      message: 'Customer deleted successfully',
    });
  })
);

/**
 * Get customer statistics
 * 
 * GET /customers/:id/stats
 */
router.get(
  '/:id/stats',
  requireRole('admin', 'sales'),
  validateParams(commonSchemas.uuid),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;
    const { id } = req.params;

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: tenant.scope({ id }),
    });

    if (!customer) {
      throw new NotFoundError('Customer', id);
    }

    // Get quote statistics
    const stats = await prisma.quote.aggregate({
      where: {
        customer_id: id,
        shop_id: tenant.shopId,
      },
      _count: true,
      _sum: {
        selling_price: true,
      },
      _avg: {
        selling_price: true,
        margin_percent: true,
      },
    });

    // Get quotes by status
    const quotesByStatus = await prisma.quote.groupBy({
      by: ['status'],
      where: {
        customer_id: id,
        shop_id: tenant.shopId,
      },
      _count: true,
    });

    res.json({
      data: {
        customerId: id,
        totalQuotes: stats._count,
        totalRevenue: stats._sum.selling_price || 0,
        averageOrderValue: stats._avg.selling_price || 0,
        averageMargin: stats._avg.margin_percent || 0,
        quotesByStatus: quotesByStatus.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {} as Record<string, number>),
        customerSince: customer.created_at,
        lastOrderDate: customer.last_order_date,
      },
    });
  })
);

export default router;