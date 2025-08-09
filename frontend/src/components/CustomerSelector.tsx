/**
 * Customer Selector Component
 * 
 * Searchable dropdown for selecting existing customers or creating new ones.
 */

import { useState, useEffect, Fragment } from 'react';
import { Combobox, Dialog, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon, PlusIcon } from '@heroicons/react/20/solid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerService, Customer } from '../services/quote.service';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';

interface CustomerSelectorProps {
  value?: string;
  onChange: (customerId: string, customer: Customer) => void;
  error?: string;
}

const createCustomerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type CreateCustomerData = z.infer<typeof createCustomerSchema>;

export default function CustomerSelector({ value, onChange, error }: CustomerSelectorProps) {
  const [query, setQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch customers based on search query
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', 'search', query],
    queryFn: () => customerService.searchCustomers(query),
    enabled: query.length >= 2,
  });

  // Get selected customer details
  const selectedCustomer = customers.find((c) => c.id === value);

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: customerService.createCustomer,
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onChange(newCustomer.id, newCustomer);
      setIsCreateModalOpen(false);
      reset();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors: formErrors },
  } = useForm<CreateCustomerData>({
    resolver: zodResolver(createCustomerSchema),
  });

  const onCreateCustomer = (data: CreateCustomerData) => {
    createCustomerMutation.mutate(data);
  };

  const filteredCustomers =
    query === ''
      ? customers
      : customers.filter((customer) => {
          return (
            customer.name.toLowerCase().includes(query.toLowerCase()) ||
            customer.email.toLowerCase().includes(query.toLowerCase())
          );
        });

  return (
    <>
      <div>
        <Combobox
          value={value}
          onChange={(customerId: string) => {
            const customer = customers.find((c) => c.id === customerId);
            if (customer) {
              onChange(customerId, customer);
            }
          }}
        >
          <div className="relative">
            <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 sm:text-sm">
              <Combobox.Input
                className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0"
                displayValue={(customerId: string) => {
                  const customer = customers.find((c) => c.id === customerId);
                  return customer ? customer.name : '';
                }}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for a customer..."
              />
              <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon
                  className="h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
              </Combobox.Button>
            </div>
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
              afterLeave={() => setQuery('')}
            >
              <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                {isLoading && query.length >= 2 && (
                  <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                    Searching...
                  </div>
                )}

                {filteredCustomers.length === 0 && query !== '' && !isLoading ? (
                  <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                    No customers found.
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <Combobox.Option
                      key={customer.id}
                      className={({ active }) =>
                        clsx(
                          'relative cursor-default select-none py-2 pl-10 pr-4',
                          active ? 'bg-primary-600 text-white' : 'text-gray-900'
                        )
                      }
                      value={customer.id}
                    >
                      {({ selected, active }) => (
                        <>
                          <div>
                            <span
                              className={clsx(
                                'block truncate',
                                selected ? 'font-medium' : 'font-normal'
                              )}
                            >
                              {customer.name}
                            </span>
                            <span
                              className={clsx(
                                'block truncate text-sm',
                                active ? 'text-primary-200' : 'text-gray-500'
                              )}
                            >
                              {customer.email}
                            </span>
                          </div>
                          {selected ? (
                            <span
                              className={clsx(
                                'absolute inset-y-0 left-0 flex items-center pl-3',
                                active ? 'text-white' : 'text-primary-600'
                              )}
                            >
                              <CheckIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                          ) : null}
                        </>
                      )}
                    </Combobox.Option>
                  ))
                )}

                {/* Create new customer option */}
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="relative w-full cursor-pointer select-none py-2 pl-3 pr-4 text-left hover:bg-gray-100 border-t"
                >
                  <div className="flex items-center">
                    <PlusIcon className="h-5 w-5 text-gray-400 mr-2" />
                    <span className="block truncate text-gray-700">
                      Create new customer
                    </span>
                  </div>
                </button>
              </Combobox.Options>
            </Transition>
          </div>
        </Combobox>

        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

        {selectedCustomer && (
          <div className="mt-2 text-sm text-gray-500">
            <p>{selectedCustomer.email}</p>
            {selectedCustomer.phone && <p>{selectedCustomer.phone}</p>}
          </div>
        )}
      </div>

      {/* Create Customer Modal */}
      <Transition appear show={isCreateModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsCreateModalOpen(false)}
        >
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Create New Customer
                  </Dialog.Title>

                  <form
                    onSubmit={handleSubmit(onCreateCustomer)}
                    className="mt-4 space-y-4"
                  >
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        {...register('name')}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      />
                      {formErrors.name && (
                        <p className="mt-1 text-sm text-red-600">
                          {formErrors.name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        {...register('email')}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      />
                      {formErrors.email && (
                        <p className="mt-1 text-sm text-red-600">
                          {formErrors.email.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="phone"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Phone (optional)
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        {...register('phone')}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="address"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Address (optional)
                      </label>
                      <textarea
                        id="address"
                        rows={2}
                        {...register('address')}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      />
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => setIsCreateModalOpen(false)}
                        className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={createCustomerMutation.isPending}
                        className="inline-flex justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {createCustomerMutation.isPending ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}