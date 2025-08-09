/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the application.
 * Handles login, logout, and user session management.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiResponse, getErrorMessage } from '../lib/api-client';

/**
 * User role enum
 */
export enum UserRole {
  ADMIN = 'admin',
  SALES = 'sales',
  PRODUCTION = 'production',
}

/**
 * User type
 */
export interface User {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Shop type
 */
export interface Shop {
  id: string;
  name: string;
  markup_percent: number;
  labor_hourly_rate: number;
}

/**
 * Auth context value type
 */
interface AuthContextValue {
  user: User | null;
  shop: Shop | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  refreshAuth: () => Promise<void>;
}

/**
 * Registration data type
 */
interface RegisterData {
  email: string;
  password: string;
  name: string;
  shopName: string;
}

/**
 * Auth response type
 */
interface AuthResponse {
  user: User;
  shop: Shop;
}

// Create context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Auth provider component
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  /**
   * Verify current authentication status
   */
  const verifyAuth = useCallback(async () => {
    try {
      const response = await apiClient.get<ApiResponse<AuthResponse>>('/auth/verify');
      setUser(response.data.data.user);
      setShop(response.data.data.shop);
    } catch (error) {
      // Not authenticated
      setUser(null);
      setShop(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Login user
   */
  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', {
        email,
        password,
      });

      setUser(response.data.data.user);
      setShop(response.data.data.shop);
      
      // Navigate based on role
      switch (response.data.data.user.role) {
        case UserRole.ADMIN:
          navigate('/dashboard');
          break;
        case UserRole.SALES:
          navigate('/quotes');
          break;
        case UserRole.PRODUCTION:
          navigate('/work-orders');
          break;
        default:
          navigate('/dashboard');
      }
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }, [navigate]);

  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setShop(null);
      navigate('/login');
    }
  }, [navigate]);

  /**
   * Register new user and shop
   */
  const register = useCallback(async (data: RegisterData) => {
    try {
      const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/register', data);
      
      setUser(response.data.data.user);
      setShop(response.data.data.shop);
      
      // New registrations go to dashboard
      navigate('/dashboard');
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }, [navigate]);

  /**
   * Refresh authentication
   */
  const refreshAuth = useCallback(async () => {
    await verifyAuth();
  }, [verifyAuth]);

  // Verify auth on mount
  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  const value: AuthContextValue = {
    user,
    shop,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook to require authentication
 */
export function useRequireAuth(requiredRoles?: UserRole[]) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }

    if (!isLoading && isAuthenticated && requiredRoles && user) {
      if (!requiredRoles.includes(user.role)) {
        navigate('/unauthorized');
      }
    }
  }, [isLoading, isAuthenticated, user, requiredRoles, navigate]);

  return { user, isLoading };
}