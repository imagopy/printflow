/**
 * Quote Routes
 * 
 * API endpoints for quote management including creation,
 * pricing calculation, and status updates.
 * 
 * @module routes/quote
 */

import { Router, Request, Response } from 'express';
import { validateBody, validateQuery } from '../middleware/validation';
import { asyncHandler } from '../utils/async-handler';
import { authenticateToken, requireRole } from '../middleware/auth';
import { attachTenant, TenantRequest } from '../middleware/tenant';
import { quoteService } from '../services/quote.service';
import {
  createQuoteSchema,
  updateQuoteSchema,
  sendQuoteSchema,
  listQuotesSchema,
} from '../validators/quote.validators';
import { prisma } from '../config/database';

const router = Router();

// All routes require authentication and tenant
router.use(authenticateToken);
router.use(attachTenant);

/**
 * GET /quotes
 * List quotes with pagination and filters
 */
router.get(
  '/',
  requireRole('admin', 'sales'),
  validateQuery(listQuotesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const quotes = await quoteService.listQuotes(
      tenantReq.tenant.shopId,
      tenantReq.query
    );
    res.json(quotes);
  })
);

/**
 * GET /quotes/stats
 * Get quote statistics
 */
router.get(
  '/stats',
  requireRole('admin', 'sales'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { start, end } = req.query as { start?: string; end?: string };
    
    const dateRange = {
      start: start ? new Date(start) : undefined,
      end: end ? new Date(end) : undefined,
    };
    
    const stats = await quoteService.getQuoteStats(
      tenantReq.tenant.shopId,
      dateRange
    );
    res.json(stats);
  })
);

/**
 * POST /quotes/preview
 * Preview quote pricing without saving
 */
router.post(
  '/preview',
  requireRole('admin', 'sales'),
  validateBody(createQuoteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const pricing = await quoteService.previewQuote(
      tenantReq.tenant.shopId,
      req.body
    );
    res.json(pricing);
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
    const tenantReq = req as TenantRequest;
    const shopId = tenantReq.tenant.shopId;

    const quote = await prisma.quote.findFirst({
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
      throw new Error('Quote not found');
    }

    res.json({
      success: true,
      data: quote,
    });
  })
);

/**
 * POST /quotes
 * Create a new quote
 */
router.post(
  '/',
  requireRole('admin', 'sales'),
  validateBody(createQuoteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const quote = await quoteService.createQuote(
      tenantReq.tenant.shopId,
      tenantReq.user.userId,
      req.body
    );
    res.status(201).json(quote);
  })
);

/**
 * PUT /quotes/:id
 * Update quote specifications and recalculate pricing
 */
router.put(
  '/:id',
  requireRole('admin', 'sales'),
  validateBody(updateQuoteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const quote = await quoteService.updateQuote(
      req.params.id,
      tenantReq.tenant.shopId,
      req.body
    );
    res.json(quote);
  })
);

/**
 * POST /quotes/:id/send
 * Send quote to customer via email
 */
router.post(
  '/:id/send',
  requireRole('admin', 'sales'),
  validateBody(sendQuoteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const result = await quoteService.sendQuote(
      req.params.id,
      tenantReq.tenant.shopId,
      req.body
    );
    res.json(result);
  })
);

/**
 * POST /quotes/:id/accept
 * Accept quote and create work order
 */
router.post(
  '/:id/accept',
  requireRole('admin', 'sales'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const result = await quoteService.acceptQuote(
      req.params.id,
      tenantReq.tenant.shopId,
      req.body
    );
    res.json(result);
  })
);

/**
 * POST /quotes/:id/reject
 * Reject quote with reason
 */
router.post(
  '/:id/reject',
  requireRole('admin', 'sales'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const result = await quoteService.rejectQuote(
      req.params.id,
      tenantReq.tenant.shopId,
      req.body
    );
    res.json(result);
  })
);

/**
 * DELETE /quotes/:id
 * Delete a draft quote
 */
router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    await quoteService.deleteQuote(
      req.params.id,
      tenantReq.tenant.shopId
    );
    res.status(204).send();
  })
);

export default router;