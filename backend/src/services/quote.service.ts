/**
 * Quote Service
 * 
 * Handles quote business logic including sending quotes,
 * generating PDFs, and managing quote lifecycle.
 * 
 * @module services/quote
 */

import { db } from '../config/database';
import { pdfService } from './pdf.service';
import { storageService } from './storage.service';
import { emailService } from './email.service';
import { templateService } from './template.service';
import { calculatePricing } from './pricing-engine';
import { Quote, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export interface SendQuoteOptions {
  recipientEmail?: string;
  message?: string;
  ccEmails?: string[];
}

export interface QuoteWithRelations extends Quote {
  customer: any;
  product: any;
  user: any;
}

class QuoteService {
  private db: typeof db;

  constructor() {
    this.db = db;
  }

  /**
   * List quotes with pagination and filters
   */
  async listQuotes(shopId: string, options: any = {}) {
    const {
      page = 1,
      pageSize = 20,
      status,
      customerId,
      productId,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;

    const where: Prisma.QuoteWhereInput = { shop_id: shopId };
    if (status) where.status = status;
    if (customerId) where.customer_id = customerId;
    if (productId) where.product_id = productId;

    const skip = (page - 1) * pageSize;

    const [quotes, total] = await Promise.all([
      this.db.quote.findMany({
        where,
        include: {
          customer: true,
          product: true,
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.db.quote.count({ where }),
    ]);

    return {
      data: quotes,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Preview quote pricing without saving
   */
  async previewQuote(shopId: string, data: any) {
    const { productId, quantity, specifications } = data;

    // Get product with material
    const product = await this.db.product.findFirst({
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
      product,
      quantity,
      specifications,
      material: product.material,
      shop: { markup_percent: 50 }, // Default markup
    });

    return {
      productId,
      quantity,
      specifications,
      pricing,
    };
  }

  /**
   * Create a new quote
   */
  async createQuote(shopId: string, userId: string, data: any) {
    const { customerId, productId, quantity, specifications } = data;

    // Verify customer belongs to shop
    const customer = await this.db.customer.findFirst({
      where: {
        id: customerId,
        shop_id: shopId,
      },
    });

    if (!customer) {
      throw new AppError('Customer not found', 404);
    }

    // Get product with material
    const product = await this.db.product.findFirst({
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

    // Get shop for markup
    const shop = await this.db.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      throw new AppError('Shop not found', 404);
    }

    // Calculate pricing
    const pricing = calculatePricing({
      product,
      quantity,
      specifications,
      material: product.material,
      shop,
    });

    // Create quote
    const quote = await this.db.quote.create({
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
          },
        },
      },
    });

    return quote;
  }

  /**
   * Update quote specifications and recalculate pricing
   */
  async updateQuote(quoteId: string, shopId: string, data: any) {
    const { quantity, specifications } = data;

    // Get existing quote
    const existingQuote = await this.db.quote.findFirst({
      where: {
        id: quoteId,
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

    // Get shop for markup
    const shop = await this.db.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      throw new AppError('Shop not found', 404);
    }

    // Recalculate pricing
    const pricing = calculatePricing({
      product: existingQuote.product,
      quantity: quantity || existingQuote.quantity,
      specifications: specifications || existingQuote.specifications,
      material: existingQuote.product.material,
      shop,
    });

    // Update quote
    const quote = await this.db.quote.update({
      where: { id: quoteId },
      data: {
        quantity: quantity || existingQuote.quantity,
        specifications: specifications || existingQuote.specifications,
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
          },
        },
      },
    });

    return quote;
  }

  /**
   * Delete a draft quote
   */
  async deleteQuote(quoteId: string, shopId: string) {
    const quote = await this.db.quote.findFirst({
      where: {
        id: quoteId,
        shop_id: shopId,
      },
    });

    if (!quote) {
      throw new AppError('Quote not found', 404);
    }

    if (quote.status !== 'draft') {
      throw new AppError('Can only delete draft quotes', 400);
    }

    await this.db.quote.delete({
      where: { id: quoteId },
    });
  }

  /**
   * Generate and send a quote PDF
   */
  async sendQuote(
    quoteId: string,
    shopId: string,
    options: SendQuoteOptions = {}
  ): Promise<{ pdfUrl: string; emailSent: boolean }> {
    try {
      // Fetch quote with relations
      const quote = await this.db.quote.findFirst({
        where: {
          id: quoteId,
          shop_id: shopId,
        },
        include: {
          customer: true,
          product: {
            include: {
              material: true,
            },
          },
          user: true,
          shop: true,
        },
      });

      if (!quote) {
        throw new AppError('Quote not found', 404);
      }

      // Parse specifications
      const specifications = quote.specifications as any;

      // Recalculate pricing to ensure accuracy
      const pricing = calculatePricing({
        product: quote.product,
        material: quote.product.material,
        quantity: quote.quantity,
        specifications,
        shop: quote.shop,
      });

      // Add unit price to pricing
      const pricingWithUnit = {
        ...pricing,
        unitPrice: pricing.sellingPrice / quote.quantity,
      };

      // Generate PDF
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30); // Valid for 30 days

      const templateData = {
        quote,
        specifications,
        pricing: pricingWithUnit,
        company: {
          name: process.env.COMPANY_NAME || 'PrintFlow',
          address: process.env.COMPANY_ADDRESS || '',
          phone: process.env.COMPANY_PHONE || '',
          email: process.env.COMPANY_EMAIL || '',
          website: process.env.COMPANY_WEBSITE || '',
        },
        validUntil,
        notes: options.message,
      };

      // Generate HTML
      const html = await templateService.generateQuotePDFHTML(templateData);

      // Generate PDF
      const pdfBuffer = await pdfService.generateQuotePDF(
        html,
        `Q-${quoteId.slice(-8).toUpperCase()}`
      );

      // Upload to storage
      const { key, url } = await storageService.uploadQuotePDF(
        pdfBuffer,
        quoteId,
        shopId
      );

      // Update quote with PDF URL
      await this.db.quote.update({
        where: { id: quoteId },
        data: {
          pdf_url: url,
          pdf_key: key,
          status: 'sent',
          sent_at: new Date(),
        },
      });

      // Send email
      let emailSent = false;
      const recipientEmail = options.recipientEmail || quote.customer.email;

      try {
        await emailService.sendQuoteEmail({
          to: recipientEmail || '',
          customerName: quote.customer.name,
          quoteNumber: `Q-${quoteId.slice(-8).toUpperCase()}`,
          quotePdfUrl: url,
          message: options.message,
        });
        emailSent = true;

        // Log email activity
        await this.logActivity(quoteId, shopId, 'email_sent', {
          recipient: recipientEmail,
          ccEmails: options.ccEmails,
        });
      } catch (emailError) {
        logger.error('Failed to send quote email', emailError as Error);
        // Continue even if email fails
      }

      // Log activity
      await this.logActivity(quoteId, shopId, 'pdf_generated', {
        pdfUrl: url,
      });

      return {
        pdfUrl: url,
        emailSent,
      };
    } catch (error) {
      logger.error('Failed to send quote', error as Error);
      throw error;
    }
  }

  /**
   * Regenerate quote PDF
   */
  async regeneratePDF(
    quoteId: string,
    shopId: string
  ): Promise<{ pdfUrl: string }> {
    const quote = await this.db.quote.findFirst({
      where: {
        id: quoteId,
        shop_id: shopId,
      },
      include: {
        customer: true,
        product: {
          include: {
            material: true,
          },
        },
      },
    });

    if (!quote) {
      throw new AppError('Quote not found', 404);
    }

    // Delete old PDF if exists
    if (quote.pdf_key) {
      try {
        await storageService.delete(quote.pdf_key);
      } catch (error) {
        logger.error('Failed to delete old PDF', error as Error);
        // Don't fail the operation if we can't delete the old PDF
      }
    }

    // Generate new PDF
    const result = await this.sendQuote(quoteId, shopId);
    return { pdfUrl: result.pdfUrl };
  }

  /**
   * Get quote PDF URL
   */
  async getQuotePDFUrl(
    quoteId: string,
    shopId: string
  ): Promise<string | null> {
    const quote = await this.db.quote.findFirst({
      where: {
        id: quoteId,
        shop_id: shopId,
      },
      select: {
        pdf_url: true,
        pdf_key: true,
      },
    });

    if (!quote || !quote.pdf_key) {
      return null;
    }

    // Check if URL is still valid
    if (quote.pdf_url) {
      // You could check expiration here
      return quote.pdf_url;
    }

    // Generate new signed URL
    const url = await storageService.getSignedUrl(quote.pdf_key, 'get', {
      expiresIn: 7 * 24 * 60 * 60, // 7 days
    });

    // Update quote with new URL
    await this.db.quote.update({
      where: { id: quoteId },
      data: { pdf_url: url },
    });

    return url;
  }

  /**
   * Accept quote and create work order
   */
  async acceptQuote(
    quoteId: string,
    shopId: string,
    data: {
      dueDate?: Date;
      notes?: string;
      assignedTo?: string;
    } = {}
  ): Promise<any> {
    const quote = await this.db.quote.findUnique({
      where: { id: quoteId },
      include: {
        customer: true,
        product: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!quote) {
      throw new AppError('Quote not found', 404);
    }

    if (quote.status === 'accepted') {
      throw new AppError('Quote already accepted', 400);
    }

    // Use transaction to ensure consistency
    const result = await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update quote status
      const updatedQuote = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: 'accepted',
          accepted_at: new Date(),
        },
      });

      // Create work order
      const workOrder = await tx.workOrder.create({
        data: {
          quote_id: quoteId,
          shop_id: shopId,
          status: 'pending',
          priority: 3,
          due_date: data.dueDate,
          production_notes: data.notes,
          assigned_to: data.assignedTo,
        },
      });

      // Log activity
      await this.logActivity(quoteId, shopId, 'accepted', {
        workOrderId: workOrder.id,
      });

      // Send notification emails
      try {
        // Notify sales team
        await emailService.sendQuoteAcceptedNotification({
          to: quote.user?.email || process.env.COMPANY_EMAIL!,
          customerName: quote.customer.name,
          quoteNumber: `Q-${quoteId.slice(-8).toUpperCase()}`,
          workOrderNumber: `WO-${workOrder.id.slice(-8).toUpperCase()}`,
        });
      } catch (error) {
        logger.error('Failed to send acceptance notification', error as Error);
        // Don't fail the operation if email fails
      }

      return {
        quote: updatedQuote,
        workOrder,
      };
    });

    return result;
  }

  /**
   * Reject quote
   */
  async rejectQuote(
    quoteId: string,
    shopId: string,
    data: {
      reason: string;
      allowRevision?: boolean;
    }
  ): Promise<Quote> {
    const quote = await this.db.quote.findFirst({
      where: {
        id: quoteId,
        shop_id: shopId,
      },
    });

    if (!quote) {
      throw new AppError('Quote not found', 404);
    }

    const updatedQuote = await this.db.quote.update({
      where: { id: quoteId },
      data: {
        status: 'rejected',
        rejected_at: new Date(),
        rejection_reason: data.reason,
      },
    });

    // Log activity
    await this.logActivity(quoteId, shopId, 'rejected', {
      reason: data.reason,
      allowRevision: data.allowRevision,
    });

    return updatedQuote;
  }

  /**
   * Log quote activity
   */
  private async logActivity(
    quoteId: string,
    shopId: string,
    action: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      await this.db.quoteActivity.create({
        data: {
          quote_id: quoteId,
          shop_id: shopId,
          action,
          metadata,
          created_at: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to log quote activity', error as Error);
      // Don't fail the operation if activity logging fails
    }
  }

  /**
   * Get quote statistics
   */
  async getQuoteStats(
    shopId: string,
    dateRange?: { start?: Date; end?: Date }
  ): Promise<any> {
    const where: Prisma.QuoteWhereInput = { shop_id: shopId };

    // Add date range filter if provided
    if (dateRange?.start || dateRange?.end) {
      where.created_at = {};
      if (dateRange.start) {
        where.created_at.gte = dateRange.start;
      }
      if (dateRange.end) {
        where.created_at.lte = dateRange.end;
      }
    }

    const [
      totalQuotes,
      quotesByStatus,
      totalValue,
      averageValue,
    ] = await Promise.all([
      // Total quotes
      this.db.quote.count({ where }),

      // Quotes by status
      this.db.quote.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),

      // Total value
      this.db.quote.aggregate({
        where,
        _sum: {
          selling_price: true,
        },
      }),

      // Average value
      this.db.quote.aggregate({
        where,
        _avg: {
          selling_price: true,
        },
      }),
    ]);

    const statusCounts = quotesByStatus.reduce((acc: Record<string, number>, item: any) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    const acceptedCount = statusCounts.accepted || 0;
    const totalCount = totalQuotes || 1;
    const conversionPercent = (acceptedCount / totalCount) * 100;

    return {
      totalQuotes,
      quotesByStatus: statusCounts,
      totalValue: totalValue._sum.selling_price || 0,
      averageValue: averageValue._avg.selling_price || 0,
      conversionRate: conversionPercent,
    };
  }
}

// Export singleton instance
export const quoteService = new QuoteService();