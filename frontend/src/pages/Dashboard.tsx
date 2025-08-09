/**
 * Dashboard Page Component
 * 
 * Displays key metrics, charts, and recent activity for the print shop.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  CurrencyDollarIcon, 
  DocumentTextIcon, 
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline';
import { apiClient, ApiResponse } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import clsx from 'clsx';

interface DashboardStats {
  quotes: {
    total: number;
    thisMonth: number;
    changePercent: number;
    totalValue: number;
  };
  customers: {
    total: number;
    newThisMonth: number;
    changePercent: number;
  };
  workOrders: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
  revenue: {
    thisMonth: number;
    lastMonth: number;
    changePercent: number;
  };
}

interface RecentActivity {
  id: string;
  type: 'quote' | 'work_order' | 'customer';
  description: string;
  timestamp: string;
  user: string;
}

function StatCard({ 
  name, 
  value, 
  change, 
  icon: Icon,
  href,
}: {
  name: string;
  value: string | number;
  change?: number;
  icon: any;
  href?: string;
}) {
  const isPositive = change && change > 0;
  
  const content = (
    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
      <dt className="flex items-center text-sm font-medium text-gray-500">
        <Icon className="h-5 w-5 text-gray-400 mr-2" />
        {name}
      </dt>
      <dd className="mt-1 flex items-baseline justify-between">
        <div className="text-2xl font-semibold text-gray-900">{value}</div>
        {change !== undefined && (
          <div
            className={clsx(
              isPositive ? 'text-green-600' : 'text-red-600',
              'ml-2 flex items-baseline text-sm font-semibold'
            )}
          >
            {isPositive ? (
              <ArrowUpIcon className="h-4 w-4 flex-shrink-0 self-center" />
            ) : (
              <ArrowDownIcon className="h-4 w-4 flex-shrink-0 self-center" />
            )}
            <span className="ml-1">{Math.abs(change)}%</span>
          </div>
        )}
      </dd>
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block hover:opacity-75 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

export default function Dashboard() {
  const { user } = useAuth();

  // Fetch dashboard statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<DashboardStats>>('/dashboard/stats');
      return response.data.data;
    },
  });

  // Fetch recent activity
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<RecentActivity[]>>('/dashboard/activity');
      return response.data.data;
    },
  });

  if (statsLoading || activityLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.email}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's what's happening in your print shop today.
        </p>
      </div>

      {/* Stats Grid */}
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          name="Total Quotes"
          value={stats?.quotes.total || 0}
          change={stats?.quotes.changePercent}
          icon={DocumentTextIcon}
          href="/quotes"
        />
        <StatCard
          name="Active Customers"
          value={stats?.customers.total || 0}
          change={stats?.customers.changePercent}
          icon={UserGroupIcon}
          href="/customers"
        />
        <StatCard
          name="Pending Orders"
          value={stats?.workOrders.pending || 0}
          icon={ClipboardDocumentListIcon}
          href="/work-orders"
        />
        <StatCard
          name="Revenue (Month)"
          value={`$${(stats?.revenue.thisMonth || 0).toLocaleString()}`}
          change={stats?.revenue.changePercent}
          icon={CurrencyDollarIcon}
        />
      </dl>

      {/* Work Order Status */}
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Work Order Status</h2>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="text-center">
              <p className="text-3xl font-semibold text-yellow-600">
                {stats?.workOrders.pending || 0}
              </p>
              <p className="mt-1 text-sm text-gray-500">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-semibold text-blue-600">
                {stats?.workOrders.inProgress || 0}
              </p>
              <p className="mt-1 text-sm text-gray-500">In Progress</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-semibold text-green-600">
                {stats?.workOrders.completed || 0}
              </p>
              <p className="mt-1 text-sm text-gray-500">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
        <div className="bg-white shadow rounded-lg">
          <ul className="divide-y divide-gray-200">
            {activity && activity.length > 0 ? (
              activity.map((item) => (
                <li key={item.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        {item.type === 'quote' && (
                          <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                        )}
                        {item.type === 'work_order' && (
                          <ClipboardDocumentListIcon className="h-5 w-5 text-gray-400" />
                        )}
                        {item.type === 'customer' && (
                          <UserGroupIcon className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-900">
                          {item.description}
                        </p>
                        <p className="text-sm text-gray-500">
                          by {item.user} • {format(new Date(item.timestamp), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              ))
            ) : (
              <li className="px-6 py-4">
                <p className="text-sm text-gray-500 text-center">No recent activity</p>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/quotes/new"
            className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <span className="mt-2 block text-sm font-medium text-gray-900">
              Create New Quote
            </span>
          </Link>
          <Link
            to="/customers/new"
            className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
            <span className="mt-2 block text-sm font-medium text-gray-900">
              Add New Customer
            </span>
          </Link>
          <Link
            to="/work-orders"
            className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-400" />
            <span className="mt-2 block text-sm font-medium text-gray-900">
              View Work Orders
            </span>
          </Link>
          <Link
            to="/reports"
            className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            <CurrencyDollarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <span className="mt-2 block text-sm font-medium text-gray-900">
              View Reports
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}