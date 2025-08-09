/**
 * Product Routes
 * 
 * Handles product management operations including CRUD,
 * category management, and material associations.
 * 
 * @module routes/product
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
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
  productCategoriesSchema,
  bulkUpdateProductsSchema,
  duplicateProductSchema,
  CreateProductRequest,
  UpdateProductRequest,
  ListProductsQuery,
  ProductCategoriesQuery,
  BulkUpdateProductsRequest,
  DuplicateProductRequest,
} from '../validators/product.validators';
import { 
  NotFoundError, 
  BusinessError, 
  ConflictError 
} from '../utils/errors';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';

const router = Router();

// Apply authentication and tenant isolation to all routes
router.use(authenticate);
router.use(tenantIsolation);

/**
 * List products with pagination and filtering
 * 
 * GET /products
 */
router.get(
  '/',
  validateQuery(listProductsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;
    const query = req.query as ListProductsQuery;

    // Build where clause with filters
    const where: Prisma.ProductWhereInput = tenant.scope({});

    // Search filter (name or category)
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Category filter
    if (query.category) {
      where.category = { equals: query.category, mode: 'insensitive' };
    }

    // Active filter
    if (query.active !== undefined) {
      where.active = query.active;
    }

    // Has material filter
    if (query.hasMaterial !== undefined) {
      where.material_id = query.hasMaterial ? { not: null } : null;
    }

    // Setup cost range filter
    if (query.minSetupCost !== undefined || query.maxSetupCost !== undefined) {
      where.setup_cost = {};
      if (query.minSetupCost !== undefined) {
        where.setup_cost.gte = query.minSetupCost;
      }
      if (query.maxSetupCost !== undefined) {
        where.setup_cost.lte = query.maxSetupCost;
      }
    }

    // Pagination
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // Sorting
    const orderBy: Prisma.ProductOrderByWithRelationInput = {};
    if (query.sortBy) {
      orderBy[query.sortBy as keyof Prisma.ProductOrderByWithRelationInput] = 
        query.sortOrder || 'asc';
    } else {
      orderBy.name = 'asc';
    }

    // Execute query with count
    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          material: {
            select: {
              id: true,
              name: true,
              cost_per_unit: true,
              unit_type: true,
            },
          },
          _count: {
            select: {
              quotes: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      data: products,
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
 * Get product categories
 * 
 * GET /products/categories
 */
router.get(
  '/categories',
  validateQuery(productCategoriesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;
    const query = req.query as ProductCategoriesQuery;

    // Build where clause
    const where: Prisma.ProductWhereInput = tenant.scope({});
    if (query.active !== undefined) {
      where.active = query.active;
    }

    // Get distinct categories with counts
    const categories = await prisma.product.groupBy({
      by: ['category'],
      where,
      _count: {
        _all: true,
      },
      orderBy: {
        category: 'asc',
      },
    });

    res.json({
      data: categories.map(cat => ({
        category: cat.category,
        count: cat._count._all,
      })),
    });
  })
);

/**
 * Get product statistics
 * 
 * GET /products/stats
 */
router.get(
  '/stats',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;

    // Get date range from query params
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : new Date(new Date().setMonth(new Date().getMonth() - 3)); // 3 months default
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate as string) 
      : new Date();

    // Get product statistics
    const [
      productCount,
      categoryStats,
      quoteStats,
      materialUsage,
    ] = await Promise.all([
      // Total products by status
      prisma.product.groupBy({
        by: ['active'],
        where: { shop_id: tenant.shopId },
        _count: true,
      }),

      // Products per category
      prisma.product.groupBy({
        by: ['category'],
        where: { 
          shop_id: tenant.shopId,
          active: true,
        },
        _count: true,
        _avg: {
          setup_cost: true,
          estimated_hours: true,
        },
      }),

      // Quote statistics per product
      prisma.quote.groupBy({
        by: ['product_id'],
        where: {
          shop_id: tenant.shopId,
          created_at: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: true,
        _sum: {
          quantity: true,
          selling_price: true,
        },
        _avg: {
          margin_percent: true,
        },
      }),

      // Material usage
      prisma.product.groupBy({
        by: ['material_id'],
        where: {
          shop_id: tenant.shopId,
          material_id: { not: null },
        },
        _count: true,
      }),
    ]);

    // Fetch product details for quote stats
    const productIds = quoteStats.map(stat => stat.product_id);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
      select: {
        id: true,
        name: true,
        category: true,
      },
    });

    const productMap = new Map(products.map(p => [p.id, p]));

    // Fetch material details
    const materialIds = materialUsage
      .map(usage => usage.material_id)
      .filter((id): id is string => id !== null);
    const materials = await prisma.material.findMany({
      where: {
        id: { in: materialIds },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const materialMap = new Map(materials.map(m => [m.id, m]));

    res.json({
      data: {
        period: {
          startDate,
          endDate,
        },
        overview: {
          totalProducts: productCount.reduce((sum, item) => sum + item._count, 0),
          activeProducts: productCount.find(item => item.active)?._count || 0,
          inactiveProducts: productCount.find(item => !item.active)?._count || 0,
          totalCategories: categoryStats.length,
        },
        byCategory: categoryStats.map(cat => ({
          category: cat.category,
          count: cat._count,
          averageSetupCost: cat._avg.setup_cost || 0,
          averageEstimatedHours: cat._avg.estimated_hours || 0,
        })),
        topProducts: quoteStats
          .sort((a, b) => (b._sum.selling_price || 0) - (a._sum.selling_price || 0))
          .slice(0, 10)
          .map(stat => ({
            product: productMap.get(stat.product_id),
            quoteCount: stat._count,
            totalQuantity: stat._sum.quantity || 0,
            totalRevenue: stat._sum.selling_price || 0,
            averageMargin: stat._avg.margin_percent || 0,
          })),
        materialUsage: materialUsage.map(usage => ({
          material: usage.material_id ? materialMap.get(usage.material_id) : null,
          productCount: usage._count,
        })),
      },
    });
  })
);

/**
 * Get product by ID
 * 
 * GET /products/:id
 */
router.get(
  '/:id',
  validateParams(commonSchemas.uuid),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;
    const { id } = req.params;

    const product = await prisma.product.findFirst({
      where: tenant.scope({ id }),
      include: {
        material: true,
        quotes: {
          select: {
            id: true,
            created_at: true,
            status: true,
            selling_price: true,
          },
          orderBy: { created_at: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            quotes: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product', id);
    }

    res.json({ data: product });
  })
);

/**
 * Create new product
 * 
 * POST /products
 */
router.post(
  '/',
  requireRole('admin'),
  writeLimiter,
  validateBody(createProductSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const data = req.body as CreateProductRequest;

    // Check if product name already exists
    const existingProduct = await prisma.product.findFirst({
      where: tenant.scope({
        name: { equals: data.name, mode: 'insensitive' },
      }),
    });

    if (existingProduct) {
      throw new ConflictError('Product with this name already exists');
    }

    // Verify material belongs to shop if provided
    if (data.material_id) {
      const material = await prisma.material.findFirst({
        where: tenant.scope({ id: data.material_id }),
      });

      if (!material) {
        throw new NotFoundError('Material', data.material_id);
      }
    }

    // Create product
    const product = await prisma.product.create({
      data: tenant.scopeCreate({
        name: data.name,
        category: data.category,
        base_cost_formula: data.base_cost_formula,
        setup_cost: data.setup_cost,
        setup_threshold: data.setup_threshold,
        estimated_hours: data.estimated_hours,
        material_id: data.material_id,
        active: data.active ?? true,
      }),
      include: {
        material: {
          select: {
            id: true,
            name: true,
            cost_per_unit: true,
            unit_type: true,
          },
        },
      },
    });

    logger.info('Product created', {
      productId: product.id,
      name: product.name,
      category: product.category,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.status(201).json({ 
      data: product,
      message: 'Product created successfully',
    });
  })
);

/**
 * Update product
 * 
 * PUT /products/:id
 */
router.put(
  '/:id',
  requireRole('admin'),
  writeLimiter,
  validateParams(commonSchemas.uuid),
  validateBody(updateProductSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { id } = req.params;
    const updates = req.body as UpdateProductRequest;

    // Check if product exists
    const existingProduct = await prisma.product.findFirst({
      where: tenant.scope({ id }),
    });

    if (!existingProduct) {
      throw new NotFoundError('Product', id);
    }

    // Check for name conflicts if updating name
    if (updates.name && updates.name !== existingProduct.name) {
      const nameConflict = await prisma.product.findFirst({
        where: tenant.scope({
          name: { equals: updates.name, mode: 'insensitive' },
          id: { not: id },
        }),
      });

      if (nameConflict) {
        throw new ConflictError('Product with this name already exists');
      }
    }

    // Verify material belongs to shop if updating
    if (updates.material_id !== undefined && updates.material_id !== null) {
      const material = await prisma.material.findFirst({
        where: tenant.scope({ id: updates.material_id }),
      });

      if (!material) {
        throw new NotFoundError('Material', updates.material_id);
      }
    }

    // Update product
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.category !== undefined && { category: updates.category }),
        ...(updates.base_cost_formula !== undefined && { base_cost_formula: updates.base_cost_formula }),
        ...(updates.setup_cost !== undefined && { setup_cost: updates.setup_cost }),
        ...(updates.setup_threshold !== undefined && { setup_threshold: updates.setup_threshold }),
        ...(updates.estimated_hours !== undefined && { estimated_hours: updates.estimated_hours }),
        ...(updates.material_id !== undefined && { material_id: updates.material_id }),
        ...(updates.active !== undefined && { active: updates.active }),
      },
      include: {
        material: {
          select: {
            id: true,
            name: true,
            cost_per_unit: true,
            unit_type: true,
          },
        },
      },
    });

    logger.info('Product updated', {
      productId: product.id,
      updates: Object.keys(updates),
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.json({ 
      data: product,
      message: 'Product updated successfully',
    });
  })
);

/**
 * Bulk update products
 * 
 * PATCH /products/bulk
 */
router.patch(
  '/bulk',
  requireRole('admin'),
  writeLimiter,
  validateBody(bulkUpdateProductsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { productIds, updates } = req.body as BulkUpdateProductsRequest;

    // Verify all products belong to shop
    const productCount = await prisma.product.count({
      where: {
        id: { in: productIds },
        shop_id: tenant.shopId,
      },
    });

    if (productCount !== productIds.length) {
      throw new BusinessError(
        'One or more products not found or do not belong to your shop',
        'INVALID_PRODUCT_IDS'
      );
    }

    // Verify material if updating
    if (updates.material_id !== undefined && updates.material_id !== null) {
      const material = await prisma.material.findFirst({
        where: tenant.scope({ id: updates.material_id }),
      });

      if (!material) {
        throw new NotFoundError('Material', updates.material_id);
      }
    }

    // Perform bulk update
    const result = await prisma.product.updateMany({
      where: {
        id: { in: productIds },
        shop_id: tenant.shopId,
      },
      data: updates,
    });

    logger.info('Products bulk updated', {
      productIds,
      updates,
      count: result.count,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.json({
      message: `${result.count} products updated successfully`,
      data: {
        count: result.count,
        productIds,
        updates,
      },
    });
  })
);

/**
 * Duplicate product
 * 
 * POST /products/:id/duplicate
 */
router.post(
  '/:id/duplicate',
  requireRole('admin'),
  writeLimiter,
  validateParams(commonSchemas.uuid),
  validateBody(duplicateProductSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { id } = req.params;
    const options = req.body as DuplicateProductRequest;

    // Fetch original product
    const originalProduct = await prisma.product.findFirst({
      where: tenant.scope({ id }),
    });

    if (!originalProduct) {
      throw new NotFoundError('Product', id);
    }

    // Generate new name
    const newName = options.name || `${originalProduct.name} (Copy)`;

    // Check for name conflicts
    const nameConflict = await prisma.product.findFirst({
      where: tenant.scope({
        name: { equals: newName, mode: 'insensitive' },
      }),
    });

    if (nameConflict) {
      throw new ConflictError('Product with this name already exists');
    }

    // Calculate adjusted pricing if requested
    let setupCost = originalProduct.setup_cost;
    if (options.adjustPricing && options.pricingAdjustment !== undefined) {
      const adjustment = 1 + (options.pricingAdjustment / 100);
      setupCost = Number((Number(originalProduct.setup_cost) * adjustment).toFixed(2));
    }

    // Create duplicate product
    const newProduct = await prisma.product.create({
      data: tenant.scopeCreate({
        name: newName,
        category: originalProduct.category,
        base_cost_formula: originalProduct.base_cost_formula,
        setup_cost: setupCost,
        setup_threshold: originalProduct.setup_threshold,
        estimated_hours: originalProduct.estimated_hours,
        material_id: originalProduct.material_id,
        active: true, // New products start as active
      }),
      include: {
        material: {
          select: {
            id: true,
            name: true,
            cost_per_unit: true,
            unit_type: true,
          },
        },
      },
    });

    logger.info('Product duplicated', {
      originalProductId: id,
      newProductId: newProduct.id,
      newName,
      priceAdjusted: options.adjustPricing,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.status(201).json({
      data: newProduct,
      message: 'Product duplicated successfully',
    });
  })
);

/**
 * Delete product
 * 
 * DELETE /products/:id
 */
router.delete(
  '/:id',
  requireRole('admin'),
  validateParams(commonSchemas.uuid),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { id } = req.params;

    // Check if product exists
    const product = await prisma.product.findFirst({
      where: tenant.scope({ id }),
      include: {
        _count: {
          select: {
            quotes: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product', id);
    }

    // Prevent deletion if product has quotes
    if (product._count.quotes > 0) {
      throw new BusinessError(
        `Cannot delete product with ${product._count.quotes} existing quotes. Consider deactivating it instead.`,
        'PRODUCT_HAS_QUOTES'
      );
    }

    // Delete product
    await prisma.product.delete({
      where: { id },
    });

    logger.info('Product deleted', {
      productId: id,
      name: product.name,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.json({ 
      message: 'Product deleted successfully',
    });
  })
);

export default router;