/**
 * Work Order Details Component
 * 
 * Modal for viewing and editing work order information.
 */

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useMutation } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { workOrderService, WorkOrder, WorkOrderStatus } from '../services/work-order.service';
import { getErrorMessage } from '../lib/api-client';
import clsx from 'clsx';

interface WorkOrderDetailsProps {
  workOrder: WorkOrder;
  onClose: () => void;
  onUpdate: () => void;
}

export default function WorkOrderDetails({ workOrder, onClose, onUpdate }: WorkOrderDetailsProps) {
  const [notes, setNotes] = useState(workOrder.production_notes || '');
  const [assignedTo, setAssignedTo] = useState(workOrder.assigned_to || '');
  const [dueDate, setDueDate] = useState(
    workOrder.due_date ? format(parseISO(workOrder.due_date), 'yyyy-MM-dd') : ''
  );

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: any) => workOrderService.updateWorkOrder(workOrder.id, data),
    onSuccess: () => {
      onUpdate();
      onClose();
    },
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: (status: WorkOrderStatus) => 
      workOrderService.updateWorkOrderStatus(workOrder.id, status, notes),
    onSuccess: () => {
      onUpdate();
      onClose();
    },
  });

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        production_notes: notes,
        assigned_to: assignedTo || undefined,
        due_date: dueDate || undefined,
      });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleStatusChange = async (newStatus: WorkOrderStatus) => {
    try {
      await updateStatusMutation.mutateAsync(newStatus);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const allowedNextStatuses = workOrderService.getAllowedNextStatuses(workOrder.status);
  const statusInfo = workOrderService.getStatusInfo(workOrder.status);
  const error = updateMutation.error || updateStatusMutation.error;

  return (
    <Transition appear show={true} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-900"
                    >
                      Work Order #{workOrder.id.slice(-8)}
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">
                      Created {format(parseISO(workOrder.created_at), 'PPP')}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Current Status */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Current Status</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{statusInfo.icon}</span>
                    <span className={clsx(
                      'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
                      `bg-${statusInfo.color}-100 text-${statusInfo.color}-800`
                    )}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>

                {/* Status Transitions */}
                {allowedNextStatuses.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Change Status</h4>
                    <div className="flex flex-wrap gap-2">
                      {allowedNextStatuses.map((status) => {
                        const info = workOrderService.getStatusInfo(status);
                        return (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(status)}
                            disabled={updateStatusMutation.isPending}
                            className={clsx(
                              'inline-flex items-center px-3 py-1.5 border rounded-md text-sm font-medium transition-colors',
                              'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                          >
                            <span className="mr-1.5">{info.icon}</span>
                            Move to {info.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quote Information */}
                {workOrder.quote && (
                  <div className="mb-6 bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Quote Information</h4>
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-gray-500">Customer</dt>
                        <dd className="mt-1 text-gray-900 font-medium">
                          {workOrder.quote.customer?.name}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Product</dt>
                        <dd className="mt-1 text-gray-900 font-medium">
                          {workOrder.quote.product?.name}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Quantity</dt>
                        <dd className="mt-1 text-gray-900 font-medium">
                          {workOrder.quote.quantity.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Value</dt>
                        <dd className="mt-1 text-gray-900 font-medium">
                          ${workOrder.quote.selling_price.toFixed(2)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}

                {/* Editable Fields */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-700">
                      Assigned To
                    </label>
                    <input
                      type="text"
                      id="assigned_to"
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="Enter assignee name"
                    />
                  </div>

                  <div>
                    <label htmlFor="due_date" className="block text-sm font-medium text-gray-700">
                      Due Date
                    </label>
                    <input
                      type="date"
                      id="due_date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                      Production Notes
                    </label>
                    <textarea
                      id="notes"
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="Add any production notes or special instructions..."
                    />
                  </div>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="mb-4 rounded-md bg-red-50 p-4">
                    <p className="text-sm text-red-800">{getErrorMessage(error)}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="inline-flex justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}