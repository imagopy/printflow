/**
 * Quote Service
 * 
 * API service for quote-related operations including
 * pricing calculations and quote management.
 */

import { apiClient, ApiResponse } from '../lib/api-client';

// Types
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  created_at: string;
  last_order_date?: string;
}

export interface Material {
  id: string;
  name: string;
  cost_per_unit: number;
  unit_type: 'sheet' | 'roll' | 'kg';
}

export interface Product {
  id: string;
  name: string;
  category: string;
  setup_cost: number;
  setup_threshold: number;
  estimated_hours: number;
  material_id?: string;
  material?: Material;
  active: boolean;
}

export interface QuoteSpecifications {
  // Common fields
  paper_type?: string;
  colors?: number;
  finishing?: string[];
  
  // Business cards
  card_width_mm?: number;
  card_height_mm?: number;
  sheet_width_mm?: number;
  sheet_height_mm?: number;
  
  // Flyers/Banners
  width_mm?: number;
  height_mm?: number;
  folded?: boolean;
  
  // Custom fields
  [key: string]: any;
}

export interface PricingBreakdown {
  cardsPerSheet?: number;
  sheetsNeeded?: number;
  materialUsage?: number;
  [key: string]: any;
}

export interface PricingResult {
  materialCost: number;
  setupCost: number;
  laborCost: number;
  totalCost: number;
  sellingPrice: number;
  marginPercent: number;
  breakdown: PricingBreakdown;
}

export interface Quote {
  id: string;
  customer_id: string;
  customer?: Customer;
  product_id: string;
  product?: Product;
  quantity: number;
  specifications: QuoteSpecifications;
  calculated_cost: number;
  selling_price: number;
  margin_percent: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface CreateQuoteRequest {
  customerId: string;
  productId: string;
  quantity: number;
  specifications: QuoteSpecifications;
}

export interface PreviewQuoteRequest {
  productId: string;
  quantity: number;
  specifications: QuoteSpecifications;
}

export interface QuotePreviewResponse {
  productId: string;
  quantity: number;
  specifications: QuoteSpecifications;
  pricing: PricingResult;
}

export interface ProductStats {
  totalProducts: number;
  activeProducts: number;
  productsByCategory: Record<string, number>;
  recentlyUsed: number;
  averageSetupCost: number;
}

// API functions
export const quoteService = {
  /**
   * Get paginated list of quotes
   */
  async getQuotes(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    customerId?: string;
    productId?: string;
  }) {
    const response = await apiClient.get<ApiResponse<Quote[]>>('/quotes', { params });
    return response.data;
  },

  /**
   * Get quote by ID
   */
  async getQuote(id: string) {
    const response = await apiClient.get<ApiResponse<Quote>>(`/quotes/${id}`);
    return response.data.data;
  },

  /**
   * Preview quote pricing without saving
   */
  async previewPricing(data: PreviewQuoteRequest) {
    const response = await apiClient.post<ApiResponse<QuotePreviewResponse>>(
      '/quotes/preview',
      data
    );
    return response.data.data;
  },

  /**
   * Create new quote
   */
  async createQuote(data: CreateQuoteRequest) {
    const response = await apiClient.post<ApiResponse<Quote>>('/quotes', data);
    return response.data.data;
  },

  /**
   * Update existing quote
   */
  async updateQuote(id: string, data: Partial<CreateQuoteRequest>) {
    const response = await apiClient.put<ApiResponse<Quote>>(`/quotes/${id}`, data);
    return response.data.data;
  },

  /**
   * Send quote to customer
   */
  async sendQuote(id: string, data?: { message?: string; recipientEmail?: string }) {
    const response = await apiClient.post<ApiResponse<{ quoteId: string; sentAt: string }>>(
      `/quotes/${id}/send`,
      data
    );
    return response.data.data;
  },

  /**
   * Accept quote and create work order
   */
  async acceptQuote(id: string, data?: { dueDate?: string; notes?: string }) {
    const response = await apiClient.post<ApiResponse<any>>(`/quotes/${id}/accept`, data);
    return response.data.data;
  },

  /**
   * Reject quote
   */
  async rejectQuote(id: string, data: { reason: string; allowRevision?: boolean }) {
    const response = await apiClient.post<ApiResponse<Quote>>(`/quotes/${id}/reject`, data);
    return response.data.data;
  },

  /**
   * Delete quote
   */
  async deleteQuote(id: string) {
    const response = await apiClient.delete(`/quotes/${id}`);
    return response.data;
  },
};

// Related services for quote dependencies
export const customerService = {
  /**
   * Get paginated list of customers
   */
  async getCustomers(params?: { page?: number; pageSize?: number; search?: string }) {
    const response = await apiClient.get<ApiResponse<Customer[]>>('/customers', { params });
    return response.data;
  },

  /**
   * Get customer by ID
   */
  async getCustomer(id: string) {
    const response = await apiClient.get<ApiResponse<Customer>>(`/customers/${id}`);
    return response.data.data;
  },

  /**
   * Search customers by name or email
   */
  async searchCustomers(query: string) {
    const response = await apiClient.get<ApiResponse<Customer[]>>('/customers', {
      params: { search: query, pageSize: 10 },
    });
    return response.data.data;
  },

  /**
   * Create new customer
   */
  async createCustomer(data: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
  }) {
    const response = await apiClient.post<ApiResponse<Customer>>('/customers', data);
    return response.data.data;
  },

  /**
   * Update customer
   */
  async updateCustomer(id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  }) {
    const response = await apiClient.put<ApiResponse<Customer>>(`/customers/${id}`, data);
    return response.data.data;
  },

  /**
   * Delete customer
   */
  async deleteCustomer(id: string) {
    const response = await apiClient.delete(`/customers/${id}`);
    return response.data;
  },
};

export const productService = {
  /**
   * Get list of products
   */
  async getProducts(params?: { 
    page?: number;
    pageSize?: number;
    active?: boolean; 
    category?: string;
    search?: string;
  }) {
    const response = await apiClient.get<ApiResponse<Product[]>>('/products', {
      params: { ...params, active: params?.active ?? true },
    });
    return response.data;
  },

  /**
   * Get product by ID
   */
  async getProduct(id: string) {
    const response = await apiClient.get<ApiResponse<Product>>(`/products/${id}`);
    return response.data.data;
  },

  /**
   * Get product categories
   */
  async getCategories() {
    const response = await apiClient.get<ApiResponse<{ category: string; count: number }[]>>(
      '/products/categories'
    );
    return response.data.data;
  },

  /**
   * Get product statistics
   */
  async getProductStats() {
    const response = await apiClient.get<ApiResponse<ProductStats>>('/products/stats');
    return response.data.data;
  },

  /**
   * Create new product
   */
  async createProduct(data: {
    name: string;
    category: string;
    setup_cost: number;
    setup_threshold: number;
    estimated_hours: number;
    material_id?: string;
    active?: boolean;
  }) {
    const response = await apiClient.post<ApiResponse<Product>>('/products', data);
    return response.data.data;
  },

  /**
   * Update product
   */
  async updateProduct(id: string, data: {
    name?: string;
    category?: string;
    setup_cost?: number;
    setup_threshold?: number;
    estimated_hours?: number;
    material_id?: string;
    active?: boolean;
  }) {
    const response = await apiClient.put<ApiResponse<Product>>(`/products/${id}`, data);
    return response.data.data;
  },

  /**
   * Duplicate product
   */
  async duplicateProduct(id: string, data: { name: string }) {
    const response = await apiClient.post<ApiResponse<Product>>(`/products/${id}/duplicate`, data);
    return response.data.data;
  },

  /**
   * Bulk update products
   */
  async bulkUpdateProducts(data: {
    productIds: string[];
    updates: {
      active?: boolean;
      category?: string;
    };
  }) {
    const response = await apiClient.patch<ApiResponse<{ updated: number; products: Product[] }>>(
      '/products/bulk',
      data
    );
    return response.data.data;
  },

  /**
   * Delete product
   */
  async deleteProduct(id: string) {
    const response = await apiClient.delete(`/products/${id}`);
    return response.data;
  },
};