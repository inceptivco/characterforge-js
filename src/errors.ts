/**
 * Custom Error Classes for CharacterForge SDK
 *
 * These error classes provide consistent error handling across the SDK
 * with specific error types for different failure scenarios.
 */

// ============================================================================
// Base Application Error
// ============================================================================

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string = 'APP_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

export class AuthenticationError extends AppError {
  constructor(message: string = 'Invalid or missing API key') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Not authorized to perform this action') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

// ============================================================================
// Credit Errors
// ============================================================================

export class InsufficientCreditsError extends AppError {
  public readonly required: number;
  public readonly available: number;

  constructor(required: number = 1, available: number = 0) {
    super(
      'Insufficient credits. Please purchase more credits to continue.',
      'INSUFFICIENT_CREDITS',
      402
    );
    this.required = required;
    this.available = available;
  }
}

export class PaymentError extends AppError {
  constructor(message: string = 'Payment processing failed') {
    super(message, 'PAYMENT_ERROR', 402);
  }
}

// ============================================================================
// API Errors
// ============================================================================

export class ApiError extends AppError {
  public readonly endpoint?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    endpoint?: string,
    code: string = 'API_ERROR'
  ) {
    super(message, code, statusCode);
    this.endpoint = endpoint;
  }
}

export class RateLimitError extends ApiError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super('Too many requests. Please try again later.', 429, undefined, 'RATE_LIMIT');
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends AppError {
  constructor(message: string = 'Network error. Please check your connection.') {
    super(message, 'NETWORK_ERROR', 0);
  }
}

// ============================================================================
// Generation Errors
// ============================================================================

export class GenerationError extends AppError {
  constructor(message: string = 'Failed to generate character', code: string = 'GENERATION_ERROR') {
    super(message, code, 500);
  }
}

export class ImageProcessingError extends GenerationError {
  constructor(message: string = 'Failed to process image') {
    super(message, 'IMAGE_PROCESSING_ERROR');
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends AppError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown, code: string = 'VALIDATION_ERROR') {
    super(message, code, 400);
    this.field = field;
    this.value = value;
  }
}

export class ConfigValidationError extends ValidationError {
  constructor(message: string, field?: string) {
    super(message, field, undefined, 'CONFIG_VALIDATION_ERROR');
  }
}

// ============================================================================
// Cache Errors
// ============================================================================

export class CacheError extends AppError {
  constructor(message: string = 'Cache operation failed') {
    super(message, 'CACHE_ERROR', 500);
  }
}

// ============================================================================
// Error Type Guards
// ============================================================================

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isInsufficientCreditsError(error: unknown): error is InsufficientCreditsError {
  return error instanceof InsufficientCreditsError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * Parse an unknown error into a consistent AppError format
 */
export function parseError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error message patterns
    const message = error.message.toLowerCase();

    if (message.includes('api key') || message.includes('authentication')) {
      return new AuthenticationError(error.message);
    }

    if (message.includes('credits') || message.includes('insufficient')) {
      return new InsufficientCreditsError();
    }

    if (message.includes('network') || message.includes('fetch')) {
      return new NetworkError(error.message);
    }

    return new AppError(error.message);
  }

  if (typeof error === 'string') {
    return new AppError(error);
  }

  return new AppError('An unexpected error occurred');
}

/**
 * Get a user-friendly error message
 */
export function getUserFriendlyMessage(error: unknown): string {
  const appError = parseError(error);

  // Map error codes to user-friendly messages
  const friendlyMessages: Record<string, string> = {
    AUTH_ERROR: 'Invalid API key. Please check your credentials.',
    INSUFFICIENT_CREDITS: 'You need more credits. Purchase credits to continue.',
    RATE_LIMIT: 'You\'re doing that too fast. Please wait a moment.',
    NETWORK_ERROR: 'Connection problem. Please check your internet.',
    GENERATION_ERROR: 'Unable to create your character. Please try again.',
  };

  return friendlyMessages[appError.code] || appError.message;
}

