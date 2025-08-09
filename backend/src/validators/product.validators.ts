/**
 * Product Validation Schemas
 * 
 * Zod schemas for validating product-related requests.
 * Ensures product data integrity and business rule compliance.
 * 
 * @module validators/product
 */

import { z } from 'zod';
import { commonSchemas, createPaginatedQuerySchema } from '../middleware/validation';

/**
 * Create product request schema
 */
export const createProductSchema = z.object({
  name: z
    .string()
    .min(2, 'Product name must be at least 2 characters')
    .max(100, 'Product name must not exceed 100 characters')
    .trim(),
  category: z
    .string()
    .min(2, 'Category must be at least 2 characters')
    .max(50, 'Category must not exceed 50 characters')
    .trim(),
  base_cost_formula: z
    .string()
    .max(500, 'Formula must not exceed 500 characters')
    .optional()
    .nullable(),
  setup_cost: z
    .number()
    .min(0, 'Setup cost cannot be negative')
    .max(9999.99, 'Setup cost must not exceed 9999.99'),
  setup_threshold: z
    .number()
    .int('Setup threshold must be an integer')
    .min(0, 'Setup threshold cannot be negative')
    .max(999999, 'Setup threshold must not exceed 999999'),
  estimated_hours: z
    .number()
    .min(0, 'Estimated hours cannot be negative')
    .max(999.99, 'Estimated hours must not exceed 999.99'),
  material_id: z.string().uuid('Invalid material ID').optional().nullable(),
  active: z.boolean().default(true),
});

/**
 * Update product request schema
 * All fields optional for partial updates
 */
export const updateProductSchema = z.object({
  name: z
    .string()
    .min(2, 'Product name must be at least 2 characters')
    .max(100, 'Product name must not exceed 100 characters')
    .trim()
    .optional(),
  category: z
    .string()
    .min(2, 'Category must be at least 2 characters')
    .max(50, 'Category must not exceed 50 characters')
    .trim()
    .optional(),
  base_cost_formula: z
    .string()
    .max(500, 'Formula must not exceed 500 characters')
    .optional()
    .nullable(),
  setup_cost: z
    .number()
    .min(0, 'Setup cost cannot be negative')
    .max(9999.99, 'Setup cost must not exceed 9999.99')
    .optional(),
  setup_threshold: z
    .number()
    .int('Setup threshold must be an integer')
    .min(0, 'Setup threshold cannot be negative')
    .max(999999, 'Setup threshold must not exceed 999999')
    .optional(),
  estimated_hours: z
    .number()
    .min(0, 'Estimated hours cannot be negative')
    .max(999.99, 'Estimated hours must not exceed 999.99')
    .optional(),
  material_id: z.string().uuid('Invalid material ID').optional().nullable(),
  active: z.boolean().optional(),
});

/**
 * Product query filters schema
 */
export const productFiltersSchema = z.object({
  search: z.string().min(1).optional(), // Search in name and category
  category: z.string().optional(),
  active: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  hasMaterial: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  minSetupCost: z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number).optional(),
  maxSetupCost: z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number).optional(),
});

/**
 * Product list query schema
 * Combines pagination with product-specific filters
 */
export const listProductsSchema = createPaginatedQuerySchema(productFiltersSchema);

/**
 * Product categories query schema
 */
export const productCategoriesSchema = z.object({
  active: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
});

/**
 * Bulk update products schema
 */
export const bulkUpdateProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1, 'At least one product ID required'),
  updates: z.object({
    active: z.boolean().optional(),
    category: z.string().optional(),
    material_id: z.string().uuid().optional().nullable(),
  }).refine(
    data => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  ),
});

/**
 * Product duplicate schema
 */
export const duplicateProductSchema = z.object({
  name: z
    .string()
    .min(2, 'Product name must be at least 2 characters')
    .max(100, 'Product name must not exceed 100 characters')
    .trim()
    .optional(),
  adjustPricing: z.boolean().default(false),
  pricingAdjustment: z
    .number()
    .min(-50, 'Price adjustment cannot be less than -50%')
    .max(100, 'Price adjustment cannot exceed 100%')
    .optional(),
});

/**
 * Type exports for use in route handlers
 */
export type CreateProductRequest = z.infer<typeof createProductSchema>;
export type UpdateProductRequest = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsSchema>;
export type ProductCategoriesQuery = z.infer<typeof productCategoriesSchema>;
export type BulkUpdateProductsRequest = z.infer<typeof bulkUpdateProductsSchema>;
export type DuplicateProductRequest = z.infer<typeof duplicateProductSchema>;