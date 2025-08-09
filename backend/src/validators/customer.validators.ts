/**
 * Customer Validation Schemas
 * 
 * Zod schemas for validating customer-related requests.
 * Ensures customer data integrity and consistency.
 * 
 * @module validators/customer
 */

import { z } from 'zod';
import { emailSchema, createPaginatedQuerySchema } from '../middleware/validation';

/**
 * Phone number validation schema
 * Accepts various international formats
 */
const phoneSchema = z
  .string()
  .regex(
    /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/,
    'Invalid phone number format'
  )
  .optional();

/**
 * Address schema
 * Flexible to accommodate international addresses
 */
const addressSchema = z
  .string()
  .min(5, 'Address must be at least 5 characters')
  .max(500, 'Address must not exceed 500 characters')
  .optional();

/**
 * Create customer request schema
 */
export const createCustomerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .trim(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  address: addressSchema,
  notes: z.string().max(1000, 'Notes must not exceed 1000 characters').optional(),
  taxId: z.string().max(50, 'Tax ID must not exceed 50 characters').optional(),
  contactPerson: z.string().max(100, 'Contact person name must not exceed 100 characters').optional(),
});

/**
 * Update customer request schema
 * All fields optional for partial updates
 */
export const updateCustomerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .trim()
    .optional(),
  email: emailSchema.optional().nullable(),
  phone: phoneSchema.nullable(),
  address: addressSchema.nullable(),
  notes: z.string().max(1000, 'Notes must not exceed 1000 characters').optional().nullable(),
  taxId: z.string().max(50, 'Tax ID must not exceed 50 characters').optional().nullable(),
  contactPerson: z.string().max(100, 'Contact person name must not exceed 100 characters').optional().nullable(),
});

/**
 * Customer query filters schema
 */
export const customerFiltersSchema = z.object({
  search: z.string().min(1).optional(), // Search in name, email, phone
  hasEmail: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  hasPhone: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  lastOrderAfter: z.string().datetime().optional(),
  lastOrderBefore: z.string().datetime().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
});

/**
 * Customer list query schema
 * Combines pagination with customer-specific filters
 */
export const listCustomersSchema = createPaginatedQuerySchema(customerFiltersSchema);

/**
 * Customer merge schema
 * For merging duplicate customers
 */
export const mergeCustomersSchema = z.object({
  sourceCustomerId: z.string().uuid('Invalid source customer ID'),
  targetCustomerId: z.string().uuid('Invalid target customer ID'),
  mergeQuotes: z.boolean().default(true),
  mergeNotes: z.boolean().default(true),
  keepSourceData: z.object({
    email: z.boolean().default(false),
    phone: z.boolean().default(false),
    address: z.boolean().default(false),
  }).optional(),
});

/**
 * Customer import schema
 * For bulk importing customers
 */
export const importCustomersSchema = z.object({
  customers: z.array(
    z.object({
      name: z.string().min(2).max(100).trim(),
      email: emailSchema.optional(),
      phone: phoneSchema,
      address: addressSchema,
      externalId: z.string().optional(), // For tracking imports
    })
  ).min(1, 'At least one customer must be provided').max(1000, 'Cannot import more than 1000 customers at once'),
  skipDuplicates: z.boolean().default(true),
  duplicateCheckField: z.enum(['email', 'phone', 'name']).default('email'),
});

/**
 * Customer export query schema
 */
export const exportCustomersSchema = z.object({
  format: z.enum(['csv', 'json', 'xlsx']).default('csv'),
  fields: z.array(z.string()).optional(), // If not provided, export all fields
  ...customerFiltersSchema.shape, // Include all filter options
});

/**
 * Customer statistics query schema
 */
export const customerStatsSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Type exports for use in route handlers
 */
export type CreateCustomerRequest = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;
export type MergeCustomersRequest = z.infer<typeof mergeCustomersSchema>;
export type ImportCustomersRequest = z.infer<typeof importCustomersSchema>;
export type ExportCustomersQuery = z.infer<typeof exportCustomersSchema>;
export type CustomerStatsQuery = z.infer<typeof customerStatsSchema>;