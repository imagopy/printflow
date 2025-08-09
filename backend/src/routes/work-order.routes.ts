/**
 * Work Order Routes
 * 
 * Handles work order management operations including status updates,
 * assignment, Kanban view, and production tracking.
 * 
 * @module routes/work-order
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
  updateWorkOrderStatusSchema,
  updateWorkOrderSchema,
  listWorkOrdersSchema,
  kanbanViewSchema,
  batchUpdateWorkOrdersSchema,
  recordProductionTimeSchema,
  UpdateWorkOrderStatusRequest,
  UpdateWorkOrderRequest,
  ListWorkOrdersQuery,
  KanbanViewQuery,
  BatchUpdateWorkOrdersRequest,
  RecordProductionTimeRequest,
} from '../validators/work-order.validators';
import { 
  NotFoundError, 
  BusinessError, 
  AuthorizationError 
} from '../utils/errors';
import { logger } from '../utils/logger';
import { 
  validateStatusTransition,
  getAllowedNextStatuses,
  canEditWorkOrder,
  getProductionPhase,
  calculatePriority,
  shouldNotifyOnStatusChange,
} from '../services/work-order.service';
import { Prisma, WorkOrderStatus, UserRole } from '@prisma/client';

const router = Router();

// Apply authentication and tenant isolation to all routes
router.use(authenticate);
router.use(tenantIsolation);

/**
 * List work orders with pagination and filtering
 * 
 * GET /work-orders
 */
router.get(
  '/',
  requireRole('admin', 'sales', 'production'),
  validateQuery(listWorkOrdersSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const query = req.query as ListWorkOrdersQuery;

    // Build where clause with filters
    const where: Prisma.WorkOrderWhereInput = tenant.scope({});

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Assigned to filter
    if (query.assignedTo) {
      where.assigned_to = query.assignedTo;
    }

    // Customer filter (through quote)
    if (query.customerId) {
      where.quote = {
        customer_id: query.customerId,
      };
    }

    // Overdue filter
    if (query.overdue) {
      where.due_date = {
        lt: new Date(),
      };
      where.status = {
        not: WorkOrderStatus.complete,
      };
    }

    // Due date range filter
    if (query.dueDateStart || query.dueDateEnd) {
      where.due_date = {};
      if (query.dueDateStart) {
        where.due_date.gte = new Date(query.dueDateStart);
      }
      if (query.dueDateEnd) {
        where.due_date.lte = new Date(query.dueDateEnd);
      }
    }

    // Created date range filter
    if (query.createdStart || query.createdEnd) {
      where.created_at = {};
      if (query.createdStart) {
        where.created_at.gte = new Date(query.createdStart);
      }
      if (query.createdEnd) {
        where.created_at.lte = new Date(query.createdEnd);
      }
    }

    // Pagination
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // Sorting
    const orderBy: Prisma.WorkOrderOrderByWithRelationInput = {};
    if (query.sortBy) {
      orderBy[query.sortBy as keyof Prisma.WorkOrderOrderByWithRelationInput] = 
        query.sortOrder || 'desc';
    } else {
      // Default sort by due date, then created date
      orderBy.due_date = 'asc';
    }

    // Execute query with count
    const [workOrders, totalCount] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          quote: {
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          },
          assigned_to_user: {
            select: {
              id: true,
              email: true,
            },
          },
          status_history: {
            orderBy: { changed_at: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.workOrder.count({ where }),
    ]);

    // Add calculated fields
    const enrichedWorkOrders = workOrders.map(wo => ({
      ...wo,
      priority: calculatePriority(wo.due_date, wo.status),
      productionPhase: getProductionPhase(wo.status),
      isOverdue: wo.due_date && wo.due_date < new Date() && wo.status !== WorkOrderStatus.complete,
    }));

    res.json({
      data: enrichedWorkOrders,
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
 * Get Kanban view data
 * 
 * GET /work-orders/kanban
 */
router.get(
  '/kanban',
  requireRole('admin', 'sales', 'production'),
  validateQuery(kanbanViewSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;
    const query = req.query as KanbanViewQuery;

    // Build base where clause
    const where: Prisma.WorkOrderWhereInput = tenant.scope({});

    // Apply filters
    if (query.assignedTo) {
      where.assigned_to = query.assignedTo;
    }

    if (query.dueDateStart || query.dueDateEnd) {
      where.due_date = {};
      if (query.dueDateStart) {
        where.due_date.gte = new Date(query.dueDateStart);
      }
      if (query.dueDateEnd) {
        where.due_date.lte = new Date(query.dueDateEnd);
      }
    }

    // Fetch work orders grouped by status
    const workOrdersByStatus = await Promise.all(
      Object.values(WorkOrderStatus).map(async (status) => {
        const workOrders = await prisma.workOrder.findMany({
          where: { ...where, status },
          orderBy: [
            { due_date: 'asc' },
            { created_at: 'asc' },
          ],
          include: {
            quote: {
              include: {
                customer: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                product: {
                  select: {
                    id: true,
                    name: true,
                    category: true,
                    estimated_hours: true,
                  },
                },
              },
            },
            assigned_to_user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });

        return {
          status,
          workOrders: workOrders.map(wo => ({
            ...wo,
            priority: calculatePriority(wo.due_date, wo.status),
            isOverdue: wo.due_date && wo.due_date < new Date() && wo.status !== WorkOrderStatus.complete,
          })),
          count: workOrders.length,
        };
      })
    );

    // Calculate summary statistics
    const stats = {
      total: workOrdersByStatus.reduce((sum, col) => sum + col.count, 0),
      overdue: workOrdersByStatus.reduce(
        (sum, col) => sum + col.workOrders.filter(wo => wo.isOverdue).length,
        0
      ),
      unassigned: workOrdersByStatus.reduce(
        (sum, col) => sum + col.workOrders.filter(wo => !wo.assigned_to).length,
        0
      ),
    };

    res.json({
      data: {
        columns: workOrdersByStatus,
        stats,
      },
    });
  })
);

/**
 * Get work order by ID
 * 
 * GET /work-orders/:id
 */
router.get(
  '/:id',
  requireRole('admin', 'sales', 'production'),
  validateParams(commonSchemas.uuid),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;
    const { id } = req.params;

    const workOrder = await prisma.workOrder.findFirst({
      where: tenant.scope({ id }),
      include: {
        quote: {
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
              },
            },
          },
        },
        assigned_to_user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        status_history: {
          orderBy: { changed_at: 'desc' },
          include: {
            changed_by_user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!workOrder) {
      throw new NotFoundError('Work Order', id);
    }

    // Add calculated fields
    const enrichedWorkOrder = {
      ...workOrder,
      priority: calculatePriority(workOrder.due_date, workOrder.status),
      productionPhase: getProductionPhase(workOrder.status),
      isOverdue: workOrder.due_date && workOrder.due_date < new Date() && workOrder.status !== WorkOrderStatus.complete,
      allowedNextStatuses: getAllowedNextStatuses(workOrder.status),
      canEdit: canEditWorkOrder(workOrder.status),
    };

    res.json({ data: enrichedWorkOrder });
  })
);

/**
 * Update work order status
 * 
 * PUT /work-orders/:id/status
 */
router.put(
  '/:id/status',
  requireRole('admin', 'production'),
  writeLimiter,
  validateParams(commonSchemas.uuid),
  validateBody(updateWorkOrderStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { id } = req.params;
    const { status: newStatus, notes } = req.body as UpdateWorkOrderStatusRequest;

    // Fetch current work order
    const workOrder = await prisma.workOrder.findFirst({
      where: tenant.scope({ id }),
      include: {
        quote: {
          include: {
            customer: true,
            product: true,
          },
        },
      },
    });

    if (!workOrder) {
      throw new NotFoundError('Work Order', id);
    }

    // Validate status transition
    validateStatusTransition(workOrder.status, newStatus);

    // Start transaction for status update
    const result = await prisma.$transaction(async (tx) => {
      // Update work order status
      const updatedWorkOrder = await tx.workOrder.update({
        where: { id },
        data: {
          status: newStatus,
          updated_at: new Date(),
          // Set actual start/finish times based on status
          ...(newStatus === WorkOrderStatus.in_design && !workOrder.actual_start && {
            actual_start: new Date(),
          }),
          ...(newStatus === WorkOrderStatus.complete && {
            actual_finish: new Date(),
          }),
        },
      });

      // Create status history entry
      await tx.workOrderStatusHistory.create({
        data: {
          work_order_id: id,
          status: newStatus,
          changed_by: user.userId,
          ...(notes && { notes }),
        },
      });

      return updatedWorkOrder;
    });

    // Log status change
    logger.info('Work order status updated', {
      workOrderId: id,
      oldStatus: workOrder.status,
      newStatus,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    // Check if notifications should be sent
    if (shouldNotifyOnStatusChange(newStatus)) {
      // TODO: Queue notification to customer
      logger.info('Notification queued for work order status change', {
        workOrderId: id,
        customerEmail: workOrder.quote.customer.email,
        status: newStatus,
      });
    }

    res.json({
      data: result,
      message: `Work order status updated to ${newStatus}`,
    });
  })
);

/**
 * Update work order details
 * 
 * PUT /work-orders/:id
 */
router.put(
  '/:id',
  requireRole('admin', 'production'),
  writeLimiter,
  validateParams(commonSchemas.uuid),
  validateBody(updateWorkOrderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { id } = req.params;
    const updates = req.body as UpdateWorkOrderRequest;

    // Fetch work order
    const workOrder = await prisma.workOrder.findFirst({
      where: tenant.scope({ id }),
    });

    if (!workOrder) {
      throw new NotFoundError('Work Order', id);
    }

    // Check if work order can be edited
    if (!canEditWorkOrder(workOrder.status)) {
      throw new BusinessError(
        `Cannot edit work order in ${workOrder.status} status`,
        'WORK_ORDER_NOT_EDITABLE'
      );
    }

    // Verify assigned user exists and has production role if updating assignment
    if (updates.assigned_to) {
      const assignedUser = await prisma.user.findFirst({
        where: {
          id: updates.assigned_to,
          shop_id: tenant.shopId,
          role: { in: [UserRole.production, UserRole.admin] },
        },
      });

      if (!assignedUser) {
        throw new NotFoundError('Production User', updates.assigned_to);
      }
    }

    // Update work order
    const updatedWorkOrder = await prisma.workOrder.update({
      where: { id },
      data: {
        ...(updates.assigned_to !== undefined && { assigned_to: updates.assigned_to }),
        ...(updates.due_date !== undefined && { 
          due_date: updates.due_date ? new Date(updates.due_date) : null 
        }),
        ...(updates.production_notes !== undefined && { production_notes: updates.production_notes }),
        updated_at: new Date(),
      },
      include: {
        assigned_to_user: {
          select: {
            id: true,
            email: true,
          },
        },
        quote: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    logger.info('Work order updated', {
      workOrderId: id,
      updates: Object.keys(updates),
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.json({
      data: updatedWorkOrder,
      message: 'Work order updated successfully',
    });
  })
);

/**
 * Batch update work orders
 * 
 * PATCH /work-orders/batch
 */
router.patch(
  '/batch',
  requireRole('admin', 'production'),
  writeLimiter,
  validateBody(batchUpdateWorkOrdersSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant, user } = tenantReq;
    const { workOrderIds, updates } = req.body as BatchUpdateWorkOrdersRequest;

    // Verify all work orders belong to shop
    const workOrderCount = await prisma.workOrder.count({
      where: {
        id: { in: workOrderIds },
        shop_id: tenant.shopId,
      },
    });

    if (workOrderCount !== workOrderIds.length) {
      throw new BusinessError(
        'One or more work orders not found or do not belong to your shop',
        'INVALID_WORK_ORDER_IDS'
      );
    }

    // If updating status, validate all transitions
    if (updates.status) {
      const workOrders = await prisma.workOrder.findMany({
        where: {
          id: { in: workOrderIds },
          shop_id: tenant.shopId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      for (const wo of workOrders) {
        try {
          validateStatusTransition(wo.status, updates.status);
        } catch (error) {
          throw new BusinessError(
            `Work order ${wo.id}: ${error.message}`,
            'INVALID_BATCH_TRANSITION'
          );
        }
      }
    }

    // Verify assigned user if updating
    if (updates.assigned_to) {
      const assignedUser = await prisma.user.findFirst({
        where: {
          id: updates.assigned_to,
          shop_id: tenant.shopId,
          role: { in: [UserRole.production, UserRole.admin] },
        },
      });

      if (!assignedUser) {
        throw new NotFoundError('Production User', updates.assigned_to);
      }
    }

    // Perform batch update
    const result = await prisma.$transaction(async (tx) => {
      // Update work orders
      const updateResult = await tx.workOrder.updateMany({
        where: {
          id: { in: workOrderIds },
          shop_id: tenant.shopId,
        },
        data: {
          ...(updates.assigned_to !== undefined && { assigned_to: updates.assigned_to }),
          ...(updates.status && { status: updates.status }),
          updated_at: new Date(),
        },
      });

      // If status was updated, create history entries
      if (updates.status) {
        await tx.workOrderStatusHistory.createMany({
          data: workOrderIds.map(woId => ({
            work_order_id: woId,
            status: updates.status!,
            changed_by: user.userId,
          })),
        });
      }

      return updateResult;
    });

    logger.info('Work orders batch updated', {
      workOrderIds,
      updates,
      count: result.count,
      shopId: tenant.shopId,
      userId: user.userId,
    });

    res.json({
      message: `${result.count} work orders updated successfully`,
      data: {
        count: result.count,
        workOrderIds,
        updates,
      },
    });
  })
);

/**
 * Get work order statistics
 * 
 * GET /work-orders/stats
 */
router.get(
  '/stats',
  requireRole('admin', 'production'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantReq = req as TenantRequest;
    const { tenant } = tenantReq;

    // Get date range from query params
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : new Date(new Date().setDate(new Date().getDate() - 30)); // 30 days default
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate as string) 
      : new Date();

    // Get work order statistics
    const [
      statusCounts,
      overdueCount,
      completionStats,
      assignmentStats,
      avgProductionTime,
    ] = await Promise.all([
      // Count by status
      prisma.workOrder.groupBy({
        by: ['status'],
        where: {
          shop_id: tenant.shopId,
          created_at: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: true,
      }),

      // Overdue count
      prisma.workOrder.count({
        where: {
          shop_id: tenant.shopId,
          due_date: { lt: new Date() },
          status: { not: WorkOrderStatus.complete },
        },
      }),

      // Completion statistics
      prisma.workOrder.aggregate({
        where: {
          shop_id: tenant.shopId,
          status: WorkOrderStatus.complete,
          actual_finish: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: true,
        _avg: {
          // This would need a computed field or raw query for production time
          // For now, we'll calculate it separately
        },
      }),

      // Assignment statistics
      prisma.workOrder.groupBy({
        by: ['assigned_to'],
        where: {
          shop_id: tenant.shopId,
          status: { not: WorkOrderStatus.complete },
        },
        _count: true,
      }),

      // Average production time (completed orders)
      prisma.$queryRaw<{ avg_hours: number }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (actual_finish - actual_start)) / 3600) as avg_hours
        FROM work_orders
        WHERE shop_id = ${tenant.shopId}::uuid
          AND status = ${WorkOrderStatus.complete}
          AND actual_start IS NOT NULL
          AND actual_finish IS NOT NULL
          AND created_at >= ${startDate}
          AND created_at <= ${endDate}
      `,
    ]);

    // Fetch user details for assignment stats
    const userIds = assignmentStats
      .map(stat => stat.assigned_to)
      .filter((id): id is string => id !== null);
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        email: true,
      },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    res.json({
      data: {
        period: {
          startDate,
          endDate,
        },
        overview: {
          total: statusCounts.reduce((sum, item) => sum + item._count, 0),
          overdue: overdueCount,
          completed: completionStats._count,
          avgProductionHours: avgProductionTime[0]?.avg_hours || 0,
        },
        byStatus: statusCounts.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {} as Record<WorkOrderStatus, number>),
        byAssignment: assignmentStats.map(stat => ({
          user: stat.assigned_to ? userMap.get(stat.assigned_to) : null,
          count: stat._count,
        })),
        productionPhases: Object.values(WorkOrderStatus).map(status => ({
          status,
          phase: getProductionPhase(status),
          count: statusCounts.find(s => s.status === status)?._count || 0,
        })),
      },
    });
  })
);

export default router;