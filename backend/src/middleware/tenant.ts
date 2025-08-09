/**
 * Multi-tenant Isolation Middleware
 * 
 * Ensures all database operations are scoped to the authenticated user's shop.
 * Critical for data isolation in multi-tenant SaaS architecture.
 * 
 * @module middleware/tenant
 */

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../types/auth.types';
import { AuthenticationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Tenant context interface
 * Provides shop isolation utilities
 */
export interface TenantContext {
  shopId: string;
  scope: <T extends object>(where?: T) => T & { shop_id: string };
  scopeCreate: <T extends object>(data: T) => T & { shop_id: string };
  validateShopAccess: (shopId: string) => boolean;
}

/**
 * Extend Express Request with tenant context
 */
export interface TenantRequest extends AuthenticatedRequest {
  tenant: TenantContext;
}

/**
 * Tenant isolation middleware
 * Attaches tenant context to authenticated requests
 * 
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware function
 */
export function tenantIsolation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      throw new AuthenticationError('User must be authenticated for tenant isolation');
    }

    const { shopId } = authReq.user;

    // Create tenant context
    const tenantContext: TenantContext = {
      shopId,
      
      /**
       * Scope database query to shop
       * Merges shop_id into where clause
       * 
       * @param where - Existing where clause
       * @returns {object} Where clause with shop_id
       */
      scope: <T extends object>(where?: T): T & { shop_id: string } => {
        return { ...where, shop_id: shopId } as T & { shop_id: string };
      },
      
      /**
       * Scope create data to shop
       * Adds shop_id to create data
       * 
       * @param data - Create data
       * @returns {object} Data with shop_id
       */
      scopeCreate: <T extends object>(data: T): T & { shop_id: string } => {
        return { ...data, shop_id: shopId } as T & { shop_id: string };
      },
      
      /**
       * Validate shop access
       * Checks if user has access to specific shop
       * 
       * @param targetShopId - Shop ID to check
       * @returns {boolean} True if user has access
       */
      validateShopAccess: (targetShopId: string): boolean => {
        return targetShopId === shopId;
      },
    };

    // Attach tenant context to request
    (req as TenantRequest).tenant = tenantContext;

    logger.debug('Tenant context attached', { shopId, userId: authReq.user.userId });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Create scoped Prisma where clause
 * Helper for complex queries with tenant isolation
 * 
 * @param shopId - Shop ID to scope to
 * @param where - Existing where clause
 * @returns {object} Scoped where clause
 */
export function createScopedWhere<T extends object>(
  shopId: string,
  where?: T
): T & { shop_id: string } {
  return { ...where, shop_id: shopId } as T & { shop_id: string };
}

/**
 * Create scoped Prisma include with where clauses
 * Ensures related data is also filtered by shop_id
 * 
 * @param shopId - Shop ID to scope to
 * @param include - Prisma include object
 * @returns {object} Scoped include object
 */
export function createScopedInclude(
  shopId: string,
  include: Record<string, any>
): Record<string, any> {
  const scopedInclude: Record<string, any> = {};

  for (const [key, value] of Object.entries(include)) {
    if (value === true) {
      // Simple include - add where clause
      scopedInclude[key] = {
        where: { shop_id: shopId },
      };
    } else if (typeof value === 'object' && value !== null) {
      // Complex include - merge where clause
      scopedInclude[key] = {
        ...value,
        where: createScopedWhere(shopId, value.where),
      };
    }
  }

  return scopedInclude;
}

/**
 * Validate entity belongs to shop
 * Use after fetching to ensure no data leakage
 * 
 * @param entity - Entity with shop_id
 * @param shopId - Expected shop ID
 * @param entityName - Entity name for error message
 * @throws {AuthorizationError} If entity doesn't belong to shop
 */
export function validateEntityShop(
  entity: { shop_id: string } | null,
  shopId: string,
  entityName: string
): void {
  if (!entity) {
    return; // Entity not found is handled elsewhere
  }

  if (entity.shop_id !== shopId) {
    logger.error('Tenant isolation violation detected', {
      entityName,
      entityShopId: entity.shop_id,
      userShopId: shopId,
    });
    
    throw new AuthenticationError('Access denied');
  }
}

/**
 * Type guard to check if request has tenant context
 * 
 * @param req - Express request
 * @returns {boolean} True if request has tenant context
 */
export function hasTenantContext(req: Request): req is TenantRequest {
  return 'tenant' in req && req.tenant !== undefined;
}

/**
 * Get tenant context from request
 * Throws if not available
 * 
 * @param req - Express request
 * @returns {TenantContext} Tenant context
 * @throws {Error} If tenant context not found
 */
export function getTenantContext(req: Request): TenantContext {
  if (!hasTenantContext(req)) {
    throw new Error('Tenant context not found. Ensure tenantIsolation middleware is applied.');
  }
  return req.tenant;
}

/**
 * Prisma middleware for automatic tenant filtering
 * Can be added to Prisma client for additional safety
 * 
 * @param shopId - Shop ID to filter by
 * @returns {Function} Prisma middleware function
 */
export function createPrismaTenantMiddleware(shopId: string) {
  return async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<any>) => {
    // Skip for raw queries
    if (params.model && params.action !== 'queryRaw' && params.action !== 'executeRaw') {
      // Add shop_id to where clause for queries
      if (['findFirst', 'findMany', 'findUnique', 'count', 'aggregate'].includes(params.action)) {
        params.args = params.args || {};
        params.args.where = createScopedWhere(shopId, params.args.where);
      }
      
      // Add shop_id to create data
      if (params.action === 'create') {
        params.args = params.args || {};
        params.args.data = { ...params.args.data, shop_id: shopId };
      }
      
      // Add shop_id to createMany data
      if (params.action === 'createMany') {
        params.args = params.args || {};
        if (Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((item: any) => ({ ...item, shop_id: shopId }));
        }
      }
      
      // Add shop_id to update where clause
      if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
        params.args = params.args || {};
        params.args.where = createScopedWhere(shopId, params.args.where);
      }
    }
    
    return next(params);
  };
}