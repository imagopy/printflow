/**
 * Work Order Validation Schemas
 * 
 * Zod schemas for validating work order-related requests.
 * Ensures work order data integrity and state machine compliance.
 * 
 * @module validators/work-order
 */

import { z } from 'zod';
import { WorkOrderStatus } from '@prisma/client';
import { commonSchemas, createPaginatedQuerySchema } from '../middleware/validation';

/**
 * Update work order status schema
 */
export const updateWorkOrderStatusSchema = z.object({
  status: z.nativeEnum(WorkOrderStatus, {
    errorMap: () => ({ message: 'Invalid work order status' }),
  }),
  notes: z
    .string()
    .max(1000, 'Notes must not exceed 1000 characters')
    .optional(),
});

/**
 * Update work order details schema
 */
export const updateWorkOrderSchema = z.object({
  assigned_to: z.string().uuid('Invalid user ID').optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  production_notes: z
    .string()
    .max(5000, 'Production notes must not exceed 5000 characters')
    .optional(),
});

/**
 * Work order query filters schema
 */
export const workOrderFiltersSchema = z.object({
  status: z.nativeEnum(WorkOrderStatus).optional(),
  assignedTo: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  overdue: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  dueDateStart: z.string().datetime().optional(),
  dueDateEnd: z.string().datetime().optional(),
  createdStart: z.string().datetime().optional(),
  createdEnd: z.string().datetime().optional(),
});

/**
 * Work order list query schema
 * Combines pagination with work order-specific filters
 */
export const listWorkOrdersSchema = createPaginatedQuerySchema(workOrderFiltersSchema);

/**
 * Kanban view query schema
 */
export const kanbanViewSchema = z.object({
  assignedTo: z.string().uuid().optional(),
  dueDateStart: z.string().datetime().optional(),
  dueDateEnd: z.string().datetime().optional(),
});

/**
 * Batch update work orders schema
 */
export const batchUpdateWorkOrdersSchema = z.object({
  workOrderIds: z.array(z.string().uuid()).min(1, 'At least one work order ID required'),
  updates: z.object({
    assigned_to: z.string().uuid().optional().nullable(),
    status: z.nativeEnum(WorkOrderStatus).optional(),
  }).refine(
    data => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  ),
});

/**
 * Work order production time schema
 */
export const recordProductionTimeSchema = z.object({
  action: z.enum(['start', 'pause', 'resume', 'complete']),
  notes: z.string().max(500).optional(),
});

/**
 * Type exports for use in route handlers
 */
export type UpdateWorkOrderStatusRequest = z.infer<typeof updateWorkOrderStatusSchema>;
export type UpdateWorkOrderRequest = z.infer<typeof updateWorkOrderSchema>;
export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersSchema>;
export type KanbanViewQuery = z.infer<typeof kanbanViewSchema>;
export type BatchUpdateWorkOrdersRequest = z.infer<typeof batchUpdateWorkOrdersSchema>;
export type RecordProductionTimeRequest = z.infer<typeof recordProductionTimeSchema>;