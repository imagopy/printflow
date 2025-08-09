/**
 * Kanban Column Component
 * 
 * Represents a column in the Kanban board that can receive dropped cards.
 */

import { useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';

interface KanbanColumnProps {
  id: string;
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}

const colorClasses = {
  gray: 'bg-gray-50 border-gray-200',
  blue: 'bg-blue-50 border-blue-200',
  indigo: 'bg-indigo-50 border-indigo-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  orange: 'bg-orange-50 border-orange-200',
  purple: 'bg-purple-50 border-purple-200',
  green: 'bg-green-50 border-green-200',
  red: 'bg-red-50 border-red-200',
};

export default function KanbanColumn({ 
  id, 
  title, 
  count, 
  color, 
  children 
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  const bgColorClass = colorClasses[color as keyof typeof colorClasses] || colorClasses.gray;

  return (
    <div className="flex-shrink-0 w-80">
      <div className="flex flex-col h-full">
        {/* Column Header */}
        <div className={clsx(
          'px-3 py-2 rounded-t-lg border-2 border-b-0',
          bgColorClass
        )}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
              {count}
            </span>
          </div>
        </div>

        {/* Column Content */}
        <div
          ref={setNodeRef}
          className={clsx(
            'flex-1 overflow-y-auto border-2 border-t-0 rounded-b-lg p-2 space-y-2 transition-colors',
            bgColorClass.split(' ')[1], // Just the border color
            isOver && 'bg-primary-50 border-primary-300'
          )}
          style={{ minHeight: '200px' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}