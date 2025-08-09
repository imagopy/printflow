import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import QuoteBuilder from './pages/QuoteBuilder';
import CustomerList from './pages/CustomerList';
import CustomerForm from './pages/CustomerForm';
import CustomerDetails from './pages/CustomerDetails';
import WorkOrderKanban from './pages/WorkOrderKanban';
import ProductList from './pages/ProductList';
import ProductForm from './pages/ProductForm';
import ProtectedRoute from './components/ProtectedRoute';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              
              {/* Quote routes */}
              <Route path="quotes" element={<div>Quotes Page (Coming Soon)</div>} />
              <Route path="quotes/new" element={<QuoteBuilder />} />
              <Route path="quotes/:id" element={<div>Quote Details (Coming Soon)</div>} />
              
              {/* Customer routes */}
              <Route path="customers" element={<CustomerList />} />
              <Route path="customers/new" element={<CustomerForm />} />
              <Route path="customers/:id" element={<CustomerDetails />} />
              <Route path="customers/:id/edit" element={<CustomerForm />} />
              
              {/* Work order routes */}
              <Route path="work-orders" element={<WorkOrderKanban />} />
              
              {/* Product routes */}
              <Route path="products" element={<ProductList />} />
              <Route path="products/new" element={<ProductForm />} />
              <Route path="products/:id/edit" element={<ProductForm />} />
              
              {/* Other routes */}
              <Route path="reports" element={<div>Reports Page (Coming Soon)</div>} />
              <Route path="settings" element={<div>Settings Page (Coming Soon)</div>} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
