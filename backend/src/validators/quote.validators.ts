/**
 * Quote Validation Schemas
 * 
 * Zod schemas for validating quote-related requests.
 * Ensures quote data integrity and business rule compliance.
 * 
 * @module validators/quote
 */

import { z } from 'zod';
import { QuoteStatus } from '@prisma/client';
import { commonSchemas, createPaginatedQuerySchema } from '../middleware/validation';

/**
 * Quote specifications schema
 * Flexible schema that validates common fields but allows additional properties
 */
const quoteSpecificationsSchema = z.object({
  // Common fields
  category: z.string().optional(),
  
  // Business card specifications
  card_width_mm: z.number().positive().optional(),
  card_height_mm: z.number().positive().optional(),
  sheet_width_mm: z.number().positive().optional(),
  sheet_height_mm: z.number().positive().optional(),
  bleed_mm: z.number().min(0).optional(),
  margin_mm: z.number().min(0).optional(),
  
  // Flyer/poster specifications
  size: z.string().optional(),
  width_mm: z.number().positive().optional(),
  height_mm: z.number().positive().optional(),
  items_per_sheet: z.number().positive().int().optional(),
  
  // Material specifications
  paper_type: z.string().optional(),
  material_type: z.string().optional(),
  finish: z.string().optional(),
  colors: z.number().int().min(1).max(6).optional(),
  
  // Banner specifications
  length_m: z.number().positive().optional(),
  waste_allowance_percent: z.number().min(0).max(50).optional(),
}).passthrough(); // Allow additional properties for flexibility

/**
 * Create quote request schema
 */
export const createQuoteSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  specifications: quoteSpecificationsSchema,
});

/**
 * Update quote request schema
 * All fields optional for partial updates
 */
export const updateQuoteSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID').optional(),
  productId: z.string().uuid('Invalid product ID').optional(),
  quantity: z.number().int().positive('Quantity must be a positive integer').optional(),
  specifications: quoteSpecificationsSchema.optional(),
  status: z.nativeEnum(QuoteStatus).optional(),
});

/**
 * Quote query filters schema
 */
export const quoteFiltersSchema = z.object({
  status: z.nativeEnum(QuoteStatus).optional(),
  customerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  minPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number).optional(),
  maxPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Quote list query schema
 * Combines pagination with quote-specific filters
 */
export const listQuotesSchema = createPaginatedQuerySchema(quoteFiltersSchema);

/**
 * Send quote email schema
 */
export const sendQuoteSchema = z.object({
  recipientEmail: z.string().email().optional(), // If not provided, use customer email
  ccEmails: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(200).optional(),
  message: z.string().max(1000).optional(),
  attachPdf: z.boolean().default(true),
});

/**
 * Quote acceptance schema
 */
export const acceptQuoteSchema = z.object({
  customerSignature: z.string().optional(),
  poNumber: z.string().optional(),
  notes: z.string().max(500).optional(),
  dueDate: z.string().datetime().optional(),
});

/**
 * Quote rejection schema
 */
export const rejectQuoteSchema = z.object({
  reason: z.string().min(1).max(500),
  allowRevision: z.boolean().default(true),
});

/**
 * Quote preview schema (for real-time pricing)
 */
export const previewQuoteSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  specifications: quoteSpecificationsSchema,
});

/**
 * Quote duplicate schema
 */
export const duplicateQuoteSchema = z.object({
  includeCustomer: z.boolean().default(true),
  resetStatus: z.boolean().default(true),
});

/**
 * Type exports for use in route handlers
 */
export type CreateQuoteRequest = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteRequest = z.infer<typeof updateQuoteSchema>;
export type ListQuotesQuery = z.infer<typeof listQuotesSchema>;
export type SendQuoteRequest = z.infer<typeof sendQuoteSchema>;
export type AcceptQuoteRequest = z.infer<typeof acceptQuoteSchema>;
export type RejectQuoteRequest = z.infer<typeof rejectQuoteSchema>;
export type PreviewQuoteRequest = z.infer<typeof previewQuoteSchema>;
export type DuplicateQuoteRequest = z.infer<typeof duplicateQuoteSchema>;