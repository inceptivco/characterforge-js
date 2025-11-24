/**
 * CharacterForge SDK
 *
 * AI-powered 3D character generation for web and React Native applications.
 *
 * @packageDocumentation
 */

// ============================================================================
// Main Client Export
// ============================================================================

export {
  CharacterForgeClient,
  createCharacterForgeClient,
  CharacterForgeError,
  AuthenticationError,
  InsufficientCreditsError,
  ApiError,
  NetworkError,
  RateLimitError,
} from './client';

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Character Configuration
  CharacterConfig,
  Gender,
  AgeGroupId,
  SkinToneId,
  EyeColorId,
  HairStyleId,
  HairColorId,
  ClothingItemId,
  ClothingColorId,
  AccessoryId,

  // SDK Configuration
  CharacterForgeClientConfig,
  RetryConfig,

  // Generation Types
  GenerationResult,
  StatusUpdateCallback,
  DetailedStatus,
  DetailedStatusCallback,

  // Cache Types
  CacheManager,

  // API Response Types
  GenerationApiResponse,
  ApiErrorResponse,
} from './types';

// ============================================================================
// Error Exports
// ============================================================================

export {
  AppError,
  AuthorizationError,
  GenerationError,
  ImageProcessingError,
  ValidationError,
  ConfigValidationError,
  CacheError,
  PaymentError,
  isAppError,
  isAuthenticationError,
  isInsufficientCreditsError,
  isNetworkError,
  isRateLimitError,
  parseError,
  getUserFriendlyMessage,
} from './errors';

// ============================================================================
// Cache Manager Exports (for advanced usage)
// ============================================================================

export {
  WebCacheManager,
  NativeCacheManager,
  createCacheManager,
  isReactNative,
  isBrowser,
} from './cache';

// ============================================================================
// Logger Exports (for advanced usage)
// ============================================================================

export type { LogLevel, LogEntry, LoggerConfig } from './logger';
export { Logger, logger, sdkLogger } from './logger';

// ============================================================================
// Version
// ============================================================================

export const VERSION = '1.0.0';

