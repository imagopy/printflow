/**
 * Customer Details Page Component
 * 
 * Displays detailed customer information and quote history.
 */

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeftIcon, 
  PencilIcon, 
  EnvelopeIcon, 
  PhoneIcon,
  MapPinIcon,
  DocumentTextIcon,
  CalendarIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { customerService, quoteService } from '../services/quote.service';
import { getErrorMessage } from '../lib/api-client';
import clsx from 'clsx';

export default function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Fetch customer data
  const { data: customer, isLoading: customerLoading, error: customerError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerService.getCustomer(id!),
  });

  // Fetch customer quotes
  const { data: quotesResponse, isLoading: quotesLoading } = useQuery({
    queryKey: ['quotes', 'customer', id],
    queryFn: () => quoteService.getQuotes({ customerId: id }),
  });

  const quotes = quotesResponse?.data || [];

  if (customerLoading || quotesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (customerError) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <p className="text-sm text-red-800">{getErrorMessage(customerError)}</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500">Customer not found</p>
      </div>
    );
  }

  // Calculate customer statistics
  const totalQuotes = quotes.length;
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted').length;
  const totalRevenue = quotes
    .filter(q => q.status === 'accepted')
    .reduce((sum, q) => sum + q.selling_price, 0);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-800' },
      sent: { bg: 'bg-blue-100', text: 'text-blue-800' },
      accepted: { bg: 'bg-green-100', text: 'text-green-800' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    
    return (
      <span className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.bg,
        config.text
      )}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/customers"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to customers
        </Link>
      </div>

      {/* Customer Information */}
      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl mb-8">
        <div className="px-4 py-6 sm:p-8">
          <div className="sm:flex sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <div className="mt-2 space-y-1">
                <div className="flex items-center text-sm text-gray-500">
                  <EnvelopeIcon className="h-4 w-4 mr-1.5 text-gray-400" />
                  <a href={`mailto:${customer.email}`} className="hover:text-primary-600">
                    {customer.email}
                  </a>
                </div>
                {customer.phone && (
                  <div className="flex items-center text-sm text-gray-500">
                    <PhoneIcon className="h-4 w-4 mr-1.5 text-gray-400" />
                    <a href={`tel:${customer.phone}`} className="hover:text-primary-600">
                      {customer.phone}
                    </a>
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-start text-sm text-gray-500">
                    <MapPinIcon className="h-4 w-4 mr-1.5 text-gray-400 mt-0.5" />
                    <span className="whitespace-pre-line">{customer.address}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 sm:mt-0">
              <button
                onClick={() => navigate(`/customers/${id}/edit`)}
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <PencilIcon className="-ml-1 mr-2 h-4 w-4" />
                Edit Customer
              </button>
            </div>
          </div>

          {/* Customer Stats */}
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="bg-gray-50 px-4 py-5 sm:p-6 rounded-lg">
              <dt className="text-sm font-medium text-gray-500">Total Quotes</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{totalQuotes}</dd>
            </div>
            <div className="bg-gray-50 px-4 py-5 sm:p-6 rounded-lg">
              <dt className="text-sm font-medium text-gray-500">Accepted Quotes</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{acceptedQuotes}</dd>
            </div>
            <div className="bg-gray-50 px-4 py-5 sm:p-6 rounded-lg">
              <dt className="text-sm font-medium text-gray-500">Total Revenue</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                ${totalRevenue.toFixed(2)}
              </dd>
            </div>
          </div>

          {/* Customer Metadata */}
          <div className="mt-6 border-t pt-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Customer Since</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {format(new Date(customer.created_at), 'MMMM d, yyyy')}
                </dd>
              </div>
              {customer.last_order_date && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Order</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {format(new Date(customer.last_order_date), 'MMMM d, yyyy')}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Quote History */}
      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl">
        <div className="px-4 py-6 sm:p-8">
          <div className="sm:flex sm:items-center sm:justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900">Quote History</h2>
            <Link
              to={`/quotes/new?customerId=${id}`}
              className="mt-3 sm:mt-0 inline-flex items-center justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              <DocumentTextIcon className="-ml-1 mr-2 h-4 w-4" />
              New Quote
            </Link>
          </div>

          {quotes.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new quote for this customer.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Quote #
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Product
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Amount
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {quotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                        #{quote.id.slice(-8)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                        {quote.product?.name || 'Unknown Product'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {format(new Date(quote.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                        ${quote.selling_price.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        {getStatusBadge(quote.status)}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <Link
                          to={`/quotes/${quote.id}`}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}