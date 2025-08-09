/**
 * API Client Configuration
 * 
 * Configures axios instance with base URL, authentication,
 * and interceptors for error handling.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';

// API base URL from environment or default to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with requests
});

// Request interceptor for auth and logging
apiClient.interceptors.request.use(
  (config) => {
    // Log requests in development
    if (import.meta.env.DEV) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // If we have a refresh endpoint, try to refresh token
      // For now, redirect to login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Log errors in development
    if (import.meta.env.DEV) {
      console.error('[API Error]', error.response?.data || error.message);
    }

    return Promise.reject(error);
  }
);

/**
 * API error type
 */
export interface ApiError {
  message?: string;
  error?: string;
  code?: string;
  details?: any[];
}

/**
 * Extract error message from axios error
 */
export function getErrorMessage(error: any): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiError;
    return apiError?.message || apiError?.error || error.message;
  }
  return error?.message || 'An unexpected error occurred';
}

/**
 * Type-safe API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}