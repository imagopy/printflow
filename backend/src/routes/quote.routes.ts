/**
 * Quote Routes
 * 
 * API endpoints for quote management with pricing calculations.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { zValidate } from '../middleware/validation';
import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/errors';
import { calculatePricing } from '../services/pricing-engine';
import { validateStatusTransition } from '../services/work-order.service';
import { quoteService } from '../services/quote.service';
import {
  createQuoteSchema,
  updateQuoteSchema,
  listQuotesSchema,
  previewQuoteSchema,
  sendQuoteSchema,
  acceptQuoteSchema,
  rejectQuoteSchema,
} from '../validators/quote.validators';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /quotes
 * List quotes with filtering and pagination
 */
router.get(
  '/',
  requireRole('admin', 'sales'),
  zValidate(listQuotesSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page = 1, pageSize = 20, status, customerId, productId, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    const shopId = req.user!.shop_id;

    const where: any = { shop_id: shopId };
    if (status) where.status = status;
    if (customerId) where.customer_id = customerId;
    if (productId) where.product_id = productId;

    const skip = (Number(page) - 1) * Number(pageSize);

    const [quotes, total] = await Promise.all([
      db.quote.findMany({
        where,
        include: {
          customer: true,
          product: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        skip,
        take: Number(pageSize),
        orderBy: {
          [sortBy as string]: sortOrder,
        },
      }),
      db.quote.count({ where }),
    ]);

    res.json({
      success: true,
      data: quotes,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize)),
      },
    });
  })
);

/**
 * GET /quotes/stats
 * Get quote statistics
 */
router.get(
  '/stats',
  requireRole('admin', 'sales'),
  asyncHandler(async (req, res) => {
    const shopId = req.user!.shop_id;
    const stats = await quoteService.getQuoteStats(shopId);

    res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * POST /quotes/preview
 * Preview quote pricing without saving
 */
router.post(
  '/preview',
  requireRole('admin', 'sales'),
  zValidate(previewQuoteSchema),
  asyncHandler(async (req, res) => {
    const { productId, quantity, specifications } = req.body;
    const shopId = req.user!.shop_id;

    // Get product with material
    const product = await db.product.findFirst({
      where: {
        id: productId,
        shop_id: shopId,
      },
      include: {
        material: true,
      },
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    // Calculate pricing
    const pricing = calculatePricing({
      productId,
      quantity,
      specifications,
      product,
    });

    res.json({
      success: true,
      data: {
        productId,
        quantity,
        specifications,
        pricing,
      },
    });
  })
);

/**
 * GET /quotes/:id
 * Get quote by ID
 */
router.get(
  '/:id',
  requireRole('admin', 'sales'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopId = req.user!.shop_id;

    const quote = await db.quote.findFirst({
      where: {
        id,
        shop_id: shopId,
      },
      include: {
        customer: true,
        product: {
          include: {
            material: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        workOrders: {
          orderBy: {
            created_at: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!quote) {
      throw new AppError('Quote not found', 404);
    }

    res.json({
      success: true,
      data: quote,
    });
  })
);

/**
 * POST /quotes
 * Create new quote
 */
router.post(
  '/',
  requireRole('admin', 'sales'),
  zValidate(createQuoteSchema),
  asyncHandler(async (req, res) => {
    const { customerId, productId, quantity, specifications } = req.body;
    const shopId = req.user!.shop_id;
    const userId = req.user!.id;

    // Verify customer belongs to shop
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        shop_id: shopId,
      },
    });

    if (!customer) {
      throw new AppError('Customer not found', 404);
    }

    // Get product with material
    const product = await db.product.findFirst({
      where: {
        id: productId,
        shop_id: shopId,
        active: true,
      },
      include: {
        material: true,
      },
    });

    if (!product) {
      throw new AppError('Product not found or inactive', 404);
    }

    // Calculate pricing
    const pricing = calculatePricing({
      productId,
      quantity,
      specifications,
      product,
    });

    // Create quote
    const quote = await db.quote.create({
      data: {
        shop_id: shopId,
        customer_id: customerId,
        product_id: productId,
        user_id: userId,
        quantity,
        specifications,
        calculated_cost: pricing.totalCost,
        selling_price: pricing.sellingPrice,
        margin_percent: pricing.marginPercent,
        status: 'draft',
      },
      include: {
        customer: true,
        product: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: quote,
    });
  })
);

/**
 * PUT /quotes/:id
 * Update quote
 */
router.put(
  '/:id',
  requireRole('admin', 'sales'),
  zValidate(updateQuoteSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { quantity, specifications } = req.body;
    const shopId = req.user!.shop_id;

    // Get existing quote
    const existingQuote = await db.quote.findFirst({
      where: {
        id,
        shop_id: shopId,
      },
      include: {
        product: {
          include: {
            material: true,
          },
        },
      },
    });

    if (!existingQuote) {
      throw new AppError('Quote not found', 404);
    }

    if (existingQuote.status !== 'draft') {
      throw new AppError('Can only edit draft quotes', 400);
    }

    // Recalculate pricing if quantity or specs changed
    const pricing = calculatePricing({
      productId: existingQuote.product_id,
      quantity,
      specifications,
      product: existingQuote.product,
    });

    // Update quote
    const quote = await db.quote.update({
      where: { id },
      data: {
        quantity,
        specifications,
        calculated_cost: pricing.totalCost,
        selling_price: pricing.sellingPrice,
        margin_percent: pricing.marginPercent,
      },
      include: {
        customer: true,
        product: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: quote,
    });
  })
);

/**
 * POST /quotes/:id/send
 * Send quote to customer
 */
router.post(
  '/:id/send',
  requireRole('admin', 'sales'),
  zValidate(sendQuoteSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { message, recipientEmail } = req.body;
    const shopId = req.user!.shop_id;

    // Use the quote service to generate and send the quote
    const result = await quoteService.sendQuote(id, shopId, {
      message,
      recipientEmail,
    });

    res.json({
      success: true,
      data: {
        quoteId: id,
        pdfUrl: result.pdfUrl,
        emailSent: result.emailSent,
        sentAt: new Date(),
      },
    });
  })
);

/**
 * POST /quotes/:id/accept
 * Accept quote and create work order
 */
router.post(
  '/:id/accept',
  requireRole('admin', 'sales'),
  zValidate(acceptQuoteSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { dueDate, notes } = req.body;
    const shopId = req.user!.shop_id;

    const result = await quoteService.acceptQuote(id, shopId, {
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /quotes/:id/reject
 * Reject quote
 */
router.post(
  '/:id/reject',
  requireRole('admin', 'sales'),
  zValidate(rejectQuoteSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason, allowRevision } = req.body;
    const shopId = req.user!.shop_id;

    const quote = await quoteService.rejectQuote(id, shopId, {
      reason,
      allowRevision,
    });

    res.json({
      success: true,
      data: quote,
    });
  })
);

/**
 * DELETE /quotes/:id
 * Delete quote (draft only)
 */
router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopId = req.user!.shop_id;

    const quote = await db.quote.findFirst({
      where: {
        id,
        shop_id: shopId,
      },
    });

    if (!quote) {
      throw new AppError('Quote not found', 404);
    }

    if (quote.status !== 'draft') {
      throw new AppError('Can only delete draft quotes', 400);
    }

    await db.quote.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Quote deleted successfully',
    });
  })
);

export default router;