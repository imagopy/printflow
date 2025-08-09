/**
 * Work Order Service
 * 
 * API service for work order management and status updates.
 */

import { apiClient, ApiResponse } from '../lib/api-client';
import { Quote } from './quote.service';

export type WorkOrderStatus = 
  | 'pending'
  | 'in_design'
  | 'ready_to_print'
  | 'printing'
  | 'finishing'
  | 'quality_check'
  | 'complete'
  | 'cancelled';

export interface WorkOrder {
  id: string;
  quote_id: string;
  quote?: Quote;
  status: WorkOrderStatus;
  assigned_to?: string;
  due_date?: string;
  actual_start?: string;
  actual_finish?: string;
  production_notes?: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderStats {
  totalOrders: number;
  ordersByStatus: Record<WorkOrderStatus, number>;
  overdueOrders: number;
  completedToday: number;
  averageProductionTime: number;
  utilizationRate: number;
}

export interface UpdateWorkOrderRequest {
  status?: WorkOrderStatus;
  assigned_to?: string;
  due_date?: string;
  production_notes?: string;
  priority?: number;
}

export interface BatchUpdateRequest {
  workOrderIds: string[];
  updates: {
    status?: WorkOrderStatus;
    assigned_to?: string;
    priority?: number;
  };
}

export const workOrderService = {
  /**
   * Get paginated list of work orders
   */
  async getWorkOrders(params?: {
    page?: number;
    pageSize?: number;
    status?: WorkOrderStatus | WorkOrderStatus[];
    assignedTo?: string;
    overdue?: boolean;
    sortBy?: 'due_date' | 'priority' | 'created_at';
    sortOrder?: 'asc' | 'desc';
  }) {
    const response = await apiClient.get<ApiResponse<WorkOrder[]>>('/work-orders', { params });
    return response.data;
  },

  /**
   * Get work orders for Kanban view
   */
  async getKanbanWorkOrders(params?: {
    assignedTo?: string;
    dueDate?: string;
  }) {
    const response = await apiClient.get<ApiResponse<WorkOrder[]>>('/work-orders/kanban', { params });
    return response.data;
  },

  /**
   * Get work order by ID
   */
  async getWorkOrder(id: string) {
    const response = await apiClient.get<ApiResponse<WorkOrder>>(`/work-orders/${id}`);
    return response.data.data;
  },

  /**
   * Update work order status
   */
  async updateWorkOrderStatus(id: string, status: WorkOrderStatus, notes?: string) {
    const response = await apiClient.put<ApiResponse<WorkOrder>>(
      `/work-orders/${id}/status`,
      { status, notes }
    );
    return response.data.data;
  },

  /**
   * Update work order details
   */
  async updateWorkOrder(id: string, data: UpdateWorkOrderRequest) {
    const response = await apiClient.put<ApiResponse<WorkOrder>>(`/work-orders/${id}`, data);
    return response.data.data;
  },

  /**
   * Batch update multiple work orders
   */
  async batchUpdateWorkOrders(data: BatchUpdateRequest) {
    const response = await apiClient.patch<ApiResponse<{ updated: number; workOrders: WorkOrder[] }>>(
      '/work-orders/batch',
      data
    );
    return response.data.data;
  },

  /**
   * Get work order statistics
   */
  async getWorkOrderStats() {
    const response = await apiClient.get<ApiResponse<WorkOrderStats>>('/work-orders/stats');
    return response.data.data;
  },

  /**
   * Get allowed next statuses for a work order
   */
  getAllowedNextStatuses(currentStatus: WorkOrderStatus): WorkOrderStatus[] {
    const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
      pending: ['in_design', 'cancelled'],
      in_design: ['ready_to_print', 'pending', 'cancelled'],
      ready_to_print: ['printing', 'in_design', 'cancelled'],
      printing: ['finishing', 'quality_check', 'cancelled'],
      finishing: ['quality_check', 'printing', 'cancelled'],
      quality_check: ['complete', 'printing', 'finishing', 'cancelled'],
      complete: [],
      cancelled: ['pending'],
    };
    return transitions[currentStatus] || [];
  },

  /**
   * Get status display information
   */
  getStatusInfo(status: WorkOrderStatus) {
    const statusInfo = {
      pending: { label: 'Pending', color: 'gray', icon: '⏳' },
      in_design: { label: 'In Design', color: 'blue', icon: '🎨' },
      ready_to_print: { label: 'Ready to Print', color: 'indigo', icon: '✅' },
      printing: { label: 'Printing', color: 'yellow', icon: '🖨️' },
      finishing: { label: 'Finishing', color: 'orange', icon: '✂️' },
      quality_check: { label: 'Quality Check', color: 'purple', icon: '🔍' },
      complete: { label: 'Complete', color: 'green', icon: '✓' },
      cancelled: { label: 'Cancelled', color: 'red', icon: '✗' },
    };
    return statusInfo[status] || statusInfo.pending;
  },
};