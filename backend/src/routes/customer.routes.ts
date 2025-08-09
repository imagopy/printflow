/**
 * Customer Routes
 * 
 * Handles customer management operations with multi-tenant isolation.
 * Provides CRUD operations, search, and customer statistics.
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
  CreateCustomerRequest,
  UpdateCustomerRequest,
  ListCustomersQuery,
} from '../validators/customer.validators';
import { NotFoundError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';

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
    const query = req.query as ListCustomersQuery;

    // Build where clause with filters
    const where: Prisma.CustomerWhereInput = tenant.scope({});

    // Search filter
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Email/phone filters
    if (query.hasEmail !== undefined) {
      where.email = query.hasEmail ? { not: null } : null;
    }
    if (query.hasPhone !== undefined) {
      where.phone = query.hasPhone ? { not: null } : null;
    }

    // Date filters
    if (query.lastOrderAfter || query.lastOrderBefore) {
      where.last_order_date = {};
      if (query.lastOrderAfter) {
        where.last_order_date.gte = new Date(query.lastOrderAfter);
      }
      if (query.lastOrderBefore) {
        where.last_order_date.lte = new Date(query.lastOrderBefore);
      }
    }

    if (query.createdAfter || query.createdBefore) {
      where.created_at = {};
      if (query.createdAfter) {
        where.created_at.gte = new Date(query.createdAfter);
      }
      if (query.createdBefore) {
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
    const data = req.body as CreateCustomerRequest;

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
      data: tenant.scopeCreate({
        name: data.name,
        email: data.email?.toLowerCase(),
        phone: data.phone,
        address: data.address,
      }),
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
    const updates = req.body as UpdateCustomerRequest;

    // Check if customer exists
    const existingCustomer = await prisma.customer.findFirst({
      where: tenant.scope({ id }),
    });

    if (!existingCustomer) {
      throw new NotFoundError('Customer', id);
    }

    // Check for duplicate email if updating
    if (updates.email && updates.email !== existingCustomer.email) {
      const duplicateCustomer = await prisma.customer.findFirst({
        where: tenant.scope({
          email: updates.email.toLowerCase(),
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
        ...(updates.name && { name: updates.name }),
        ...(updates.email !== undefined && { 
          email: updates.email?.toLowerCase() || null 
        }),
        ...(updates.phone !== undefined && { phone: updates.phone }),
        ...(updates.address !== undefined && { address: updates.address }),
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