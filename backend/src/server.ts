/**
 * PrintFlow API Server
 * 
 * Main entry point for the PrintFlow backend application.
 * Configures Express server with middleware, routes, and error handling.
 * 
 * @module server
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env, isProduction } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';
import { requestId } from './middleware/request-id';
import { generalLimiter } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

// Import routes
import authRoutes from './routes/auth.routes';
import customerRoutes from './routes/customer.routes';
import productRoutes from './routes/product.routes';
import quoteRoutes from './routes/quote.routes';
import workOrderRoutes from './routes/work-order.routes';
import healthRoutes from './routes/health.routes';

/**
 * Create and configure Express application
 * 
 * @returns {Application} Configured Express app
 */
function createApp(): Application {
  const app = express();

  // Trust proxy for accurate IP addresses (important for rate limiting)
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: isProduction() ? undefined : false, // Disable CSP in development
  }));

  // CORS configuration
  app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  }));

  // Request parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Compression for responses
  app.use(compression());

  // Request ID for tracing
  app.use(requestId);

  // Logging middleware
  if (!isProduction()) {
    app.use(morgan('dev'));
  } else {
    // Custom morgan format for production with request ID
    app.use(morgan(':request-id :method :url :status :response-time ms - :res[content-length]', {
      stream: {
        write: (message: string) => logger.info(message.trim()),
      },
    }));
  }

  // Define custom morgan token for request ID
  morgan.token('request-id', (req: any) => req.requestId);

  // General rate limiting
  app.use(generalLimiter);

  // API routes
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/quotes', quoteRoutes);
  app.use('/api/work-orders', workOrderRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Create Express app
    const app = createApp();

    // Start listening
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 PrintFlow API server running on port ${env.PORT}`);
      logger.info(`📍 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 Base URL: ${env.BASE_URL}`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Disconnect from database
          await disconnectDatabase();
          logger.info('Database connection closed');

          await new Promise((resolve) => setTimeout(resolve, 5000));
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', { error: error as Error });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server', { error: error as Error });
    process.exit(1);
  }
}

// Start server if this is the main module
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Server startup failed', { error });
    process.exit(1);
  });
}

// Export for testing
export { createApp, startServer };