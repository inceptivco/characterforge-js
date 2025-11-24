/**
 * Logging Utility for CharacterForge SDK
 *
 * Provides consistent logging across the SDK with support for
 * different log levels and environment detection.
 */

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  context?: string;
}

// ============================================================================
// Log Level Hierarchy
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// Environment Detection
// ============================================================================

const isDevelopment = (() => {
  // Browser environment
  if (typeof window !== 'undefined') {
    return true; // Default to development for SDK users
  }
  // Node.js environment
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }
  return true;
})();

// ============================================================================
// Default Configuration
// ============================================================================

const defaultConfig: LoggerConfig = {
  minLevel: isDevelopment ? 'debug' : 'warn',
  enableConsole: true,
};

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private config: LoggerConfig;
  private context?: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.context = config.context;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: string): Logger {
    return new Logger({
      ...this.config,
      context: this.context ? `${this.context}:${context}` : context,
    });
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }

  /**
   * Format the log entry for console output
   */
  private formatConsoleMessage(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
    ];

    if (entry.context) {
      parts.push(`[${entry.context}]`);
    }

    parts.push(entry.message);

    return parts.join(' ');
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      data,
      error,
    };

    if (this.config.enableConsole) {
      const formattedMessage = this.formatConsoleMessage(entry);
      const consoleMethod = level === 'debug' ? 'log' : level;

      if (data && Object.keys(data).length > 0) {
        console[consoleMethod](formattedMessage, data);
      } else if (error) {
        console[consoleMethod](formattedMessage, error);
      } else {
        console[consoleMethod](formattedMessage);
      }
    }
  }

  /**
   * Debug level logging - for development diagnostics
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Info level logging - for general information
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Warning level logging - for potential issues
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Error level logging - for errors and exceptions
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorObj = error instanceof Error ? error : undefined;
    this.log('error', message, data, errorObj);
  }

  /**
   * Log with timing information
   */
  time(label: string): () => void {
    const start = Date.now();
    this.debug(`Timer started: ${label}`);

    return () => {
      const duration = Date.now() - start;
      this.debug(`Timer ended: ${label}`, { durationMs: duration });
    };
  }
}

// ============================================================================
// Default Logger Instance
// ============================================================================

export const logger = new Logger();

// ============================================================================
// Specialized Loggers
// ============================================================================

export const sdkLogger = logger.child('SDK');
export const apiLogger = logger.child('API');
export const cacheLogger = logger.child('Cache');

// ============================================================================
// Exports
// ============================================================================

export { Logger };
export default logger;

