/**
 * Logger Utility
 * 
 * Provides structured logging with different levels and context support.
 * Outputs JSON in production for log aggregation, pretty format in development.
 * 
 * @module utils/logger
 */

import { env, isDevelopment, isTest } from '../config/env';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * Log context interface for structured logging
 */
export interface LogContext {
  [key: string]: any;
  userId?: string;
  shopId?: string;
  requestId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  error?: Error | string;
}

/**
 * Logger class with structured output
 */
class Logger {
  private logLevel: LogLevel;

  constructor() {
    this.logLevel = this.parseLogLevel(env.LOG_LEVEL);
  }

  /**
   * Parse log level from string
   * 
   * @param level - Log level string
   * @returns {LogLevel} Parsed log level
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Format log message for output
   * 
   * @param level - Log level
   * @param message - Log message
   * @param context - Additional context
   * @returns {string} Formatted log message
   */
  private formatMessage(
    level: string,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    
    const logObject = {
      timestamp,
      level,
      message,
      ...context,
    };

    // Pretty print in development, JSON in production
    if (isDevelopment() && !isTest()) {
      const colorMap: Record<string, string> = {
        ERROR: '\x1b[31m', // Red
        WARN: '\x1b[33m',  // Yellow
        INFO: '\x1b[36m',  // Cyan
        DEBUG: '\x1b[90m', // Gray
      };
      const reset = '\x1b[0m';
      const color = colorMap[level] || reset;
      
      let output = `${color}[${timestamp}] ${level}${reset}: ${message}`;
      if (context && Object.keys(context).length > 0) {
        output += '\n' + JSON.stringify(context, null, 2);
      }
      return output;
    }

    return JSON.stringify(logObject);
  }

  /**
   * Check if should log based on current log level
   * 
   * @param level - Log level to check
   * @returns {boolean} True if should log
   */
  private shouldLog(level: LogLevel): boolean {
    // Don't log in test environment unless it's an error
    if (isTest() && level !== LogLevel.ERROR) {
      return false;
    }
    return level <= this.logLevel;
  }

  /**
   * Log error message
   * 
   * @param message - Error message
   * @param context - Additional context
   */
  error(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, context));
    }
  }

  /**
   * Log warning message
   * 
   * @param message - Warning message
   * @param context - Additional context
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, context));
    }
  }

  /**
   * Log info message
   * 
   * @param message - Info message
   * @param context - Additional context
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, context));
    }
  }

  /**
   * Log debug message
   * 
   * @param message - Debug message
   * @param context - Additional context
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, context));
    }
  }

  /**
   * Create child logger with default context
   * 
   * @param defaultContext - Default context for all logs
   * @returns {ChildLogger} Child logger instance
   */
  child(defaultContext: LogContext): ChildLogger {
    return new ChildLogger(this, defaultContext);
  }
}

/**
 * Child logger with default context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private defaultContext: LogContext
  ) {}

  /**
   * Merge contexts with default context
   * 
   * @param context - Additional context
   * @returns {LogContext} Merged context
   */
  private mergeContext(context?: LogContext): LogContext {
    return { ...this.defaultContext, ...context };
  }

  error(message: string, context?: LogContext): void {
    this.parent.error(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }
}

/**
 * Global logger instance
 * @constant
 */
export const logger = new Logger();

/**
 * Create request-scoped logger
 * 
 * @param requestId - Request ID
 * @param userId - User ID
 * @param shopId - Shop ID
 * @returns {ChildLogger} Request-scoped logger
 */
export function createRequestLogger(
  requestId: string,
  userId?: string,
  shopId?: string
): ChildLogger {
  return logger.child({ requestId, userId, shopId });
}