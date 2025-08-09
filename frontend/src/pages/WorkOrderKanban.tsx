/**
 * Work Order Kanban Board Component
 * 
 * Interactive Kanban board for managing work orders through production stages.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { 
  CalendarIcon, 
  UserIcon, 
  ExclamationTriangleIcon,
  ClockIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { format, isAfter, parseISO } from 'date-fns';
import { workOrderService, WorkOrder, WorkOrderStatus } from '../services/work-order.service';
import KanbanColumn from '../components/KanbanColumn';
import KanbanCard from '../components/KanbanCard';
import WorkOrderDetails from '../components/WorkOrderDetails';
import { getErrorMessage } from '../lib/api-client';
import clsx from 'clsx';

const KANBAN_COLUMNS: WorkOrderStatus[] = [
  'pending',
  'in_design',
  'ready_to_print',
  'printing',
  'finishing',
  'quality_check',
  'complete',
];

export default function WorkOrderKanban() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string>('');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // Fetch work orders
  const { data: workOrdersResponse, isLoading, error } = useQuery({
    queryKey: ['work-orders', 'kanban', filterAssignee],
    queryFn: () => workOrderService.getKanbanWorkOrders({ 
      assignedTo: filterAssignee || undefined 
    }),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['work-order-stats'],
    queryFn: () => workOrderService.getWorkOrderStats(),
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WorkOrderStatus }) =>
      workOrderService.updateWorkOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-stats'] });
    },
  });

  const workOrders = workOrdersResponse?.data || [];

  // Group work orders by status
  const workOrdersByStatus = workOrders.reduce((acc, order) => {
    if (!acc[order.status]) {
      acc[order.status] = [];
    }
    
    // Apply filters
    if (showOverdueOnly && order.due_date) {
      const isOverdue = isAfter(new Date(), parseISO(order.due_date));
      if (!isOverdue) return acc;
    }
    
    acc[order.status].push(order);
    return acc;
  }, {} as Record<WorkOrderStatus, WorkOrder[]>);

  // Sort work orders within each column by priority and due date
  Object.keys(workOrdersByStatus).forEach((status) => {
    workOrdersByStatus[status as WorkOrderStatus].sort((a, b) => {
      // Priority first (higher priority = lower number)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by due date
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    });
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const workOrderId = active.id as string;
    const newStatus = over.id as WorkOrderStatus;
    
    const workOrder = workOrders.find(wo => wo.id === workOrderId);
    if (!workOrder || workOrder.status === newStatus) return;

    // Check if transition is allowed
    const allowedStatuses = workOrderService.getAllowedNextStatuses(workOrder.status);
    if (!allowedStatuses.includes(newStatus)) {
      alert(`Cannot move from ${workOrder.status} to ${newStatus}`);
      return;
    }

    try {
      await updateStatusMutation.mutateAsync({ id: workOrderId, status: newStatus });
    } catch (error) {
      alert(getErrorMessage(error));
    }
  };

  const activeWorkOrder = activeId ? workOrders.find(wo => wo.id === activeId) : null;

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <p className="text-sm text-red-800">{getErrorMessage(error)}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Work Orders</h1>
        <p className="mt-1 text-sm text-gray-500">
          Drag and drop work orders to update their status
        </p>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Total Active Orders
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {stats.totalOrders}
              </dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Overdue Orders
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-red-600">
                {stats.overdueOrders}
              </dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Completed Today
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-green-600">
                {stats.completedToday}
              </dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Utilization Rate
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {Math.round(stats.utilizationRate)}%
              </dd>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center">
          <FunnelIcon className="h-5 w-5 text-gray-400 mr-2" />
          <span className="text-sm font-medium text-gray-700">Filters:</span>
        </div>
        
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={showOverdueOnly}
            onChange={(e) => setShowOverdueOnly(e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <span className="ml-2 text-sm text-gray-700">Overdue only</span>
        </label>

        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {/* Add actual user options here */}
        </select>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <DndContext
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-full min-w-max pb-4">
              {KANBAN_COLUMNS.map((status) => {
                const statusInfo = workOrderService.getStatusInfo(status);
                const columnWorkOrders = workOrdersByStatus[status] || [];
                
                return (
                  <KanbanColumn
                    key={status}
                    id={status}
                    title={statusInfo.label}
                    count={columnWorkOrders.length}
                    color={statusInfo.color}
                  >
                    <SortableContext
                      items={columnWorkOrders.map(wo => wo.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {columnWorkOrders.map((workOrder) => (
                        <KanbanCard
                          key={workOrder.id}
                          workOrder={workOrder}
                          onClick={() => setSelectedWorkOrder(workOrder)}
                        />
                      ))}
                    </SortableContext>
                  </KanbanColumn>
                );
              })}
            </div>

            <DragOverlay>
              {activeWorkOrder && (
                <div className="rotate-3 opacity-90">
                  <KanbanCard workOrder={activeWorkOrder} isDragging />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Work Order Details Modal */}
      {selectedWorkOrder && (
        <WorkOrderDetails
          workOrder={selectedWorkOrder}
          onClose={() => setSelectedWorkOrder(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['work-orders'] });
          }}
        />
      )}
    </div>
  );
}