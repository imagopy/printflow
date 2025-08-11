/**
 * Health Check Routes
 * 
 * Provides endpoints for monitoring application health and dependencies.
 * Used by load balancers, monitoring systems, and deployment tools.
 * 
 * @module routes/health
 */

import { Router, Request, Response } from 'express';
import { isDatabaseHealthy } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

const router = Router();

/**
 * Service health status
 */
interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  responseTime?: number;
}

/**
 * Overall health response
 */
interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis?: ServiceHealth;
    storage?: ServiceHealth;
    email?: ServiceHealth;
  };
}

/**
 * Check Redis health
 * 
 * @returns {Promise<ServiceHealth>} Redis health status
 */
async function checkRedisHealth(): Promise<ServiceHealth> {
  if (!env.REDIS_URL) {
    return { status: 'healthy', message: 'Redis not configured' };
  }

  const start = Date.now();
  const redis = new Redis(env.REDIS_URL, {
    connectTimeout: 5000,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await redis.ping();
    const responseTime = Date.now() - start;
    
    redis.disconnect();
    
    return { status: 'healthy', responseTime };
  } catch (error) {
    logger.error('Redis health check failed', { error: error as Error });
    return { 
      status: 'unhealthy', 
      message: 'Redis connection failed',
      responseTime: Date.now() - start,
    };
  }
}

/**
 * Check S3/Storage health
 * 
 * @returns {Promise<ServiceHealth>} Storage health status
 */
async function checkStorageHealth(): Promise<ServiceHealth> {
  // TODO: Implement actual S3 health check
  // For now, just check if credentials are configured
  if (!env.AWS_ACCESS_KEY_ID || !env.S3_BUCKET) {
    return { status: 'unhealthy', message: 'Storage not configured' };
  }

  return { status: 'healthy', message: 'Storage credentials configured' };
}

/**
 * Check email service health
 * 
 * @returns {Promise<ServiceHealth>} Email service health status
 */
async function checkEmailHealth(): Promise<ServiceHealth> {
  // Check if email service is configured
  if (!env.SENDGRID_API_KEY && !env.AWS_SES_ACCESS_KEY_ID) {
    return { status: 'unhealthy', message: 'Email service not configured' };
  }

  return { status: 'healthy', message: 'Email service configured' };
}

/**
 * Basic health check endpoint
 * Returns 200 if service is running
 * 
 * GET /health/ping
 */
router.get('/ping', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'pong' });
});

/**
 * Liveness probe endpoint
 * Checks if the service is alive and can handle requests
 * 
 * GET /health/live
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health/ready
 * Readiness probe endpoint
 * Checks if the service is ready to handle traffic
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const dbHealthy = await isDatabaseHealthy();
    
    if (!dbHealthy) {
      res.status(503).json({
        status: 'not ready',
        reason: 'Database connection not established',
      });
      return;
    }

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed', { error: error as Error });
    res.status(503).json({
      status: 'not ready',
      reason: 'Health check failed',
    });
  }
});

/**
 * Comprehensive health check endpoint
 * Checks all service dependencies
 * 
 * GET /health
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Check all services in parallel
    const [dbHealth, redisHealth, storageHealth, emailHealth] = await Promise.all([
      isDatabaseHealthy()
        .then((healthy) => ({
          status: healthy ? 'healthy' : 'unhealthy',
          message: healthy ? undefined : 'Database connection failed',
        } as ServiceHealth))
        .catch(() => ({
          status: 'unhealthy',
          message: 'Database check failed',
        } as ServiceHealth)),
      checkRedisHealth(),
      checkStorageHealth(),
      checkEmailHealth(),
    ]);

    // Determine overall status
    const services = {
      database: dbHealth,
      ...(env.REDIS_URL && { redis: redisHealth }),
      storage: storageHealth,
      email: emailHealth,
    };

    const unhealthyServices = Object.values(services).filter(
      (service) => service.status === 'unhealthy'
    );
    
    const degradedServices = Object.values(services).filter(
      (service) => service.status === 'degraded'
    );

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (unhealthyServices.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedServices.length > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
      services,
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    res.status(statusCode).json(response);

  } catch (error) {
    logger.error('Health check failed', { error: error as Error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable',
    });
  }
});

/**
 * Metrics endpoint (basic)
 * Returns simple application metrics
 * 
 * GET /health/metrics
 */
router.get('/metrics', (_req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  res.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      external: Math.round(memoryUsage.external / 1024 / 1024), // MB
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    nodejs: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  });
});

/**
 * Get system metrics
 * @returns System resource metrics
 */

/**
 * Detailed health check endpoint
 * Checks all service dependencies and returns detailed metrics
 * 
 * GET /health/detailed
 */
router.get('/detailed', async (_req: Request, res: Response) => {
  try {
    const [dbHealth, redisHealth, storageHealth, emailHealth] = await Promise.all([
      isDatabaseHealthy()
        .then((healthy) => ({
          status: healthy ? 'healthy' : 'unhealthy',
          message: healthy ? undefined : 'Database connection failed',
        } as ServiceHealth))
        .catch(() => ({
          status: 'unhealthy',
          message: 'Database check failed',
        } as ServiceHealth)),
      checkRedisHealth(),
      checkStorageHealth(),
      checkEmailHealth(),
    ]);

    // Determine overall status
    const services = {
      database: dbHealth,
      ...(env.REDIS_URL && { redis: redisHealth }),
      storage: storageHealth,
      email: emailHealth,
    };

    const unhealthyServices = Object.values(services).filter(
      (service) => service.status === 'unhealthy'
    );
    
    const degradedServices = Object.values(services).filter(
      (service) => service.status === 'degraded'
    );

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (unhealthyServices.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedServices.length > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
      services,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Detailed health check failed', { error: error as Error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable',
    });
  }
});

/**
 * Liveness probe endpoint
 * Checks if the service is alive and can handle requests
 * 
 * GET /health/liveness
 */
router.get('/liveness', (_req: Request, res: Response) => {
  try {
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Liveness probe failed', { error: error as Error });
    res.status(503).send('Service Unavailable');
  }
});

export default router;