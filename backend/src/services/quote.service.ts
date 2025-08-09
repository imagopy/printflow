/**
 * Quote Service
 * 
 * Orchestrates quote operations including PDF generation,
 * storage, and email delivery.
 */

import { PrismaClient, Quote, Prisma } from '@prisma/client';
import { db } from '../config/database';
import { pdfService } from './pdf.service';
import { storageService } from './storage.service';
import { emailService } from './email.service';
import { templateService } from './template.service';
import { calculatePricing } from './pricing-engine';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { AuthUser } from '../types/auth.types';

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
  private db: PrismaClient;

  constructor() {
    this.db = db;
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
        },
      });

      if (!quote) {
        throw new AppError('Quote not found', 404);
      }

      // Parse specifications
      const specifications = quote.specifications as any;

      // Recalculate pricing to ensure accuracy
      const pricing = calculatePricing({
        productId: quote.product_id,
        quantity: quote.quantity,
        specifications,
        product: quote.product,
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
          to: recipientEmail,
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
        logger.error('Failed to send quote email', emailError);
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
      logger.error('Failed to send quote', error);
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
        logger.error('Failed to delete old PDF', error);
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
    const quote = await this.db.quote.findFirst({
      where: {
        id: quoteId,
        shop_id: shopId,
      },
      include: {
        customer: true,
        product: true,
      },
    });

    if (!quote) {
      throw new AppError('Quote not found', 404);
    }

    if (quote.status === 'accepted') {
      throw new AppError('Quote already accepted', 400);
    }

    // Start transaction
    const result = await this.db.$transaction(async (tx) => {
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
        logger.error('Failed to send acceptance notification', error);
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
      logger.error('Failed to log quote activity', error);
    }
  }

  /**
   * Get quote statistics
   */
  async getQuoteStats(shopId: string, dateRange?: { start: Date; end: Date }) {
    const where: Prisma.QuoteWhereInput = {
      shop_id: shopId,
    };

    if (dateRange) {
      where.created_at = {
        gte: dateRange.start,
        lte: dateRange.end,
      };
    }

    const [
      totalQuotes,
      quotesByStatus,
      totalValue,
      averageValue,
      conversionRate,
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

      // Conversion rate
      this.db.quote.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
    ]);

    const statusCounts = quotesByStatus.reduce((acc, item) => {
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