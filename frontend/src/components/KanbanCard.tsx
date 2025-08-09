/**
 * Kanban Card Component
 * 
 * Draggable card representing a work order in the Kanban board.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  CalendarIcon, 
  UserIcon, 
  ExclamationTriangleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { format, isAfter, parseISO } from 'date-fns';
import { WorkOrder } from '../services/work-order.service';
import clsx from 'clsx';

interface KanbanCardProps {
  workOrder: WorkOrder;
  onClick?: () => void;
  isDragging?: boolean;
}

export default function KanbanCard({ workOrder, onClick, isDragging }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: workOrder.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue = workOrder.due_date && isAfter(new Date(), parseISO(workOrder.due_date));
  const priorityColors = {
    1: 'border-red-400 bg-red-50',
    2: 'border-orange-400 bg-orange-50',
    3: 'border-yellow-400 bg-yellow-50',
    4: 'border-gray-300 bg-white',
    5: 'border-gray-300 bg-white',
  };

  const priorityColor = priorityColors[workOrder.priority as keyof typeof priorityColors] || priorityColors[4];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        'bg-white rounded-lg shadow-sm border-2 p-3 cursor-move hover:shadow-md transition-shadow',
        priorityColor,
        (isSortableDragging || isDragging) && 'opacity-50',
        isOverdue && 'ring-2 ring-red-500 ring-offset-1'
      )}
    >
      {/* Quote/Order Info */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-gray-900">
            #{workOrder.id.slice(-8)}
          </p>
          {workOrder.quote?.customer && (
            <p className="text-xs text-gray-600 mt-0.5">
              {workOrder.quote.customer.name}
            </p>
          )}
        </div>
        {isOverdue && (
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
        )}
      </div>

      {/* Product Info */}
      {workOrder.quote?.product && (
        <div className="mb-2">
          <p className="text-sm text-gray-700 font-medium">
            {workOrder.quote.product.name}
          </p>
          <p className="text-xs text-gray-500">
            Qty: {workOrder.quote.quantity.toLocaleString()}
          </p>
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-1">
        {workOrder.due_date && (
          <div className="flex items-center text-xs text-gray-500">
            <CalendarIcon className="h-3.5 w-3.5 mr-1" />
            <span className={clsx(isOverdue && 'text-red-600 font-medium')}>
              Due {format(parseISO(workOrder.due_date), 'MMM d')}
            </span>
          </div>
        )}
        
        {workOrder.assigned_to && (
          <div className="flex items-center text-xs text-gray-500">
            <UserIcon className="h-3.5 w-3.5 mr-1" />
            <span>{workOrder.assigned_to}</span>
          </div>
        )}

        {workOrder.production_notes && (
          <div className="flex items-start text-xs text-gray-500">
            <DocumentTextIcon className="h-3.5 w-3.5 mr-1 mt-0.5" />
            <span className="line-clamp-2">{workOrder.production_notes}</span>
          </div>
        )}
      </div>

      {/* Priority Badge */}
      <div className="mt-2 flex items-center justify-between">
        <span className={clsx(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
          workOrder.priority <= 2 ? 'bg-red-100 text-red-800' :
          workOrder.priority === 3 ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        )}>
          P{workOrder.priority}
        </span>
        
        {workOrder.quote && (
          <span className="text-xs text-gray-500">
            ${workOrder.quote.selling_price.toFixed(0)}
          </span>
        )}
      </div>
    </div>
  );
}