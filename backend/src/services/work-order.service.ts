/**
 * Work Order Service
 * 
 * Handles work order state machine logic, transitions,
 * and business rules for production workflow.
 * 
 * @module services/work-order
 */

import { WorkOrderStatus } from '@prisma/client';
import { BusinessError } from '../utils/errors';

/**
 * Valid state transitions for work orders
 * Maps current status to allowed next statuses
 */
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.pending]: [
    WorkOrderStatus.in_design,
    WorkOrderStatus.ready_to_print,
  ],
  [WorkOrderStatus.in_design]: [
    WorkOrderStatus.ready_to_print,
  ],
  [WorkOrderStatus.ready_to_print]: [
    WorkOrderStatus.printing,
  ],
  [WorkOrderStatus.printing]: [
    WorkOrderStatus.finishing,
    WorkOrderStatus.quality_check,
  ],
  [WorkOrderStatus.finishing]: [
    WorkOrderStatus.quality_check,
    WorkOrderStatus.complete,
  ],
  [WorkOrderStatus.quality_check]: [
    WorkOrderStatus.complete,
    WorkOrderStatus.printing, // Allow sending back for reprinting
  ],
  [WorkOrderStatus.complete]: [], // Terminal state
};

/**
 * Validates if a status transition is allowed
 * 
 * @param currentStatus - Current work order status
 * @param newStatus - Desired new status
 * @returns true if transition is valid
 * @throws BusinessError if transition is invalid
 */
export function validateStatusTransition(
  currentStatus: WorkOrderStatus,
  newStatus: WorkOrderStatus
): boolean {
  const allowedStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];
  
  if (!allowedStatuses.includes(newStatus)) {
    throw new BusinessError(
      `Cannot transition from ${currentStatus} to ${newStatus}`,
      'INVALID_STATUS_TRANSITION'
    );
  }
  
  return true;
}

/**
 * Gets allowed next statuses for a given current status
 * 
 * @param currentStatus - Current work order status
 * @returns Array of allowed next statuses
 */
export function getAllowedNextStatuses(
  currentStatus: WorkOrderStatus
): WorkOrderStatus[] {
  return ALLOWED_TRANSITIONS[currentStatus] || [];
}

/**
 * Checks if a work order can be edited based on its status
 * 
 * @param status - Current work order status
 * @returns true if work order can be edited
 */
export function canEditWorkOrder(status: WorkOrderStatus): boolean {
  // Only allow editing work orders that haven't started production
  return [
    WorkOrderStatus.pending,
    WorkOrderStatus.in_design,
  ].includes(status);
}

/**
 * Checks if a work order can be cancelled based on its status
 * 
 * @param status - Current work order status
 * @returns true if work order can be cancelled
 */
export function canCancelWorkOrder(status: WorkOrderStatus): boolean {
  // Cannot cancel completed work orders
  return status !== WorkOrderStatus.complete;
}

/**
 * Gets the production phase for a given status
 * Used for grouping in reports and UI
 * 
 * @param status - Work order status
 * @returns Production phase name
 */
export function getProductionPhase(status: WorkOrderStatus): string {
  switch (status) {
    case WorkOrderStatus.pending:
    case WorkOrderStatus.in_design:
      return 'Pre-production';
    case WorkOrderStatus.ready_to_print:
    case WorkOrderStatus.printing:
      return 'Production';
    case WorkOrderStatus.finishing:
    case WorkOrderStatus.quality_check:
      return 'Post-production';
    case WorkOrderStatus.complete:
      return 'Completed';
    default:
      return 'Unknown';
  }
}

/**
 * Calculates estimated completion time based on status
 * 
 * @param status - Current work order status
 * @param estimatedHours - Total estimated hours for the job
 * @returns Estimated hours remaining
 */
export function getEstimatedHoursRemaining(
  status: WorkOrderStatus,
  estimatedHours: number
): number {
  const completionPercentage: Record<WorkOrderStatus, number> = {
    [WorkOrderStatus.pending]: 0,
    [WorkOrderStatus.in_design]: 0.15,
    [WorkOrderStatus.ready_to_print]: 0.25,
    [WorkOrderStatus.printing]: 0.60,
    [WorkOrderStatus.finishing]: 0.85,
    [WorkOrderStatus.quality_check]: 0.95,
    [WorkOrderStatus.complete]: 1.0,
  };

  const percentComplete = completionPercentage[status] || 0;
  return Math.max(0, estimatedHours * (1 - percentComplete));
}

/**
 * Determines if a status change should trigger notifications
 * 
 * @param newStatus - New work order status
 * @returns true if notifications should be sent
 */
export function shouldNotifyOnStatusChange(newStatus: WorkOrderStatus): boolean {
  // Notify on major milestones
  return [
    WorkOrderStatus.ready_to_print,
    WorkOrderStatus.quality_check,
    WorkOrderStatus.complete,
  ].includes(newStatus);
}

/**
 * Gets priority level based on due date and current status
 * 
 * @param dueDate - Work order due date
 * @param status - Current status
 * @returns Priority level (1-5, where 5 is highest)
 */
export function calculatePriority(
  dueDate: Date | null,
  status: WorkOrderStatus
): number {
  if (!dueDate) return 3; // Default medium priority

  const now = new Date();
  const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Already overdue
  if (hoursUntilDue < 0) {
    return status === WorkOrderStatus.complete ? 1 : 5;
  }

  // Due within 24 hours
  if (hoursUntilDue < 24) {
    return status === WorkOrderStatus.complete ? 2 : 5;
  }

  // Due within 48 hours
  if (hoursUntilDue < 48) {
    return 4;
  }

  // Due within 72 hours
  if (hoursUntilDue < 72) {
    return 3;
  }

  // More than 72 hours away
  return 2;
}