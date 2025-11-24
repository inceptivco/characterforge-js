/**
 * CharacterForge SDK Client
 *
 * Main client for generating character images with built-in caching,
 * retry logic, and comprehensive error handling.
 */

import type {
  CharacterConfig,
  CacheManager,
  CharacterForgeClientConfig,
  RetryConfig,
  StatusUpdateCallback,
  GenerationApiResponse,
  ApiErrorResponse,
} from './types';
import { createCacheManager } from './cache';
import { sdkLogger } from './logger';
import {
  ApiError,
  NetworkError,
  InsufficientCreditsError,
  AuthenticationError,
  GenerationError,
  RateLimitError,
} from './errors';

// Re-export error classes for convenience
export {
  AuthenticationError,
  InsufficientCreditsError,
  GenerationError as CharacterForgeError,
  ApiError,
  NetworkError,
  RateLimitError,
};

// ============================================================================
// Constants
// ============================================================================

/**
 * Default base URL for the CharacterForge API
 * 
 * This points to the CharacterForge production backend. SDK users do NOT need
 * to change this - they just provide their API keys obtained from characterforge.app.
 * 
 * The baseUrl config option exists for advanced scenarios like:
 * - Self-hosting the CharacterForge backend
 * - Testing against a staging environment
 * - Corporate/enterprise custom deployments
 */
const DEFAULT_BASE_URL = 'https://mnxzykltetirdcnxugcl.supabase.co/functions/v1';
const DEFAULT_TIMEOUT = 60000; // 60 seconds
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
} as const;

const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a stable cache key from configuration
 * Uses sorted keys to ensure deterministic key generation
 * Only includes defined values to avoid cache collisions
 */
function generateCacheKey(config: CharacterConfig): string {
  const sortedKeys = Object.keys(config).sort();
  const stableObj: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    // Exclude non-visual props that shouldn't affect cache
    if (key === 'cache') continue;
    
    const value = config[key as keyof CharacterConfig];
    
    // Only include defined values to prevent cache collisions
    // (JSON.stringify omits undefined, so we must exclude them explicitly)
    if (value !== undefined) {
      stableObj[key] = value;
    }
  }

  return JSON.stringify(stableObj);
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Wait for a specified duration
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable based on its type or status code
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof RateLimitError) return true;
  if (error instanceof ApiError) return true;

  // Check for network-related error messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch') ||
      message.includes('failed to fetch')
    );
  }

  return false;
}

/**
 * Parse HTTP error response into appropriate error class
 */
function parseHttpError(status: number, data: ApiErrorResponse | GenerationApiResponse): Error {
  const errorData = data as ApiErrorResponse;
  const message = errorData.error || 'An unexpected error occurred';

  // Check for specific error types
  if (status === 401 || message.toLowerCase().includes('api key')) {
    return new AuthenticationError(message);
  }

  if (status === 402 || message.toLowerCase().includes('credits')) {
    return new InsufficientCreditsError();
  }

  if (status === 429) {
    return new RateLimitError();
  }

  if (RETRYABLE_STATUS_CODES.includes(status)) {
    return new ApiError(message, status, 'generate-character');
  }

  return new GenerationError(message);
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NetworkError('Request timeout');
    }
    throw error;
  }
}

// ============================================================================
// SDK Client Class
// ============================================================================

export class CharacterForgeClient {
  private cacheManager: CacheManager;
  private config: Required<CharacterForgeClientConfig>;
  private retryConfig: RetryConfig;

  constructor(config: CharacterForgeClientConfig) {
    if (!config.apiKey) {
      throw new AuthenticationError('API key is required');
    }

    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
      cache: config.cache ?? true,
      cacheManager: config.cacheManager || createCacheManager(),
      timeout: config.timeout || DEFAULT_TIMEOUT,
      retry: config.retry || DEFAULT_RETRY_CONFIG,
    };

    this.retryConfig = this.config.retry;
    this.cacheManager = this.config.cacheManager;

    sdkLogger.info('SDK Client initialized', {
      cacheEnabled: this.config.cache,
      baseUrl: this.config.baseUrl,
    });
  }

  /**
   * Generate a character image based on the configuration
   * Includes caching, retry logic, and comprehensive error handling
   */
  async generate(
    characterConfig: CharacterConfig,
    onStatusUpdate?: StatusUpdateCallback
  ): Promise<string> {
    const shouldCache = this.config.cache && characterConfig.cache !== false;
    const cacheKey = generateCacheKey(characterConfig);

    sdkLogger.debug('Starting generation', {
      shouldCache,
      gender: characterConfig.gender,
    });

    // Check cache first
    if (shouldCache) {
      try {
        const cachedUrl = await this.cacheManager.get(cacheKey);
        if (cachedUrl) {
          sdkLogger.info('Cache hit');
          onStatusUpdate?.('Retrieved from Client Cache!');
          return cachedUrl;
        }
        sdkLogger.debug('Cache miss');
      } catch (cacheError) {
        sdkLogger.warn('Cache lookup failed', { error: cacheError });
        // Continue with API call on cache failure
      }
    }

    // Call API with retry logic
    onStatusUpdate?.('Calling AI Cloud...');
    const imageUrl = await this.callApiWithRetry(characterConfig);

    // Cache the result and return local cached URL if available
    if (shouldCache && imageUrl) {
      const cachedUrl = await this.cacheResult(cacheKey, imageUrl, onStatusUpdate);
      if (cachedUrl) {
        sdkLogger.debug('Returning local cached URL');
        return cachedUrl;
      }
    }

    // Fallback to remote URL if caching failed or was disabled
    return imageUrl;
  }

  /**
   * Call the generation API with retry logic
   */
  private async callApiWithRetry(config: CharacterConfig): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        sdkLogger.debug('API call attempt', { attempt: attempt + 1 });

        const url = `${this.config.baseUrl}/generate-character`;
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify(config),
          },
          this.config.timeout
        );

        // Handle HTTP errors
        if (!response.ok) {
          const data = await response.json() as ApiErrorResponse | GenerationApiResponse;
          const error = parseHttpError(response.status, data);

          // Always throw to be caught by the catch block below
          // The catch block will determine if the error is retryable
          throw error;
        }

        // Parse successful response
        const data = await response.json() as GenerationApiResponse;

        if (!data.image) {
          throw new GenerationError('No image URL in response');
        }

        sdkLogger.info('Generation successful', {
          attempt: attempt + 1,
        });

        return data.image;

      } catch (error) {
        lastError = error instanceof Error ? error : new GenerationError('Unknown error');

        // Don't retry authentication or credit errors
        if (lastError instanceof AuthenticationError ||
            lastError instanceof InsufficientCreditsError) {
          throw lastError;
        }

        // Check if we should retry
        if (attempt < this.retryConfig.maxRetries && isRetryableError(error)) {
          const delayMs = calculateBackoffDelay(
            attempt,
            this.retryConfig.baseDelayMs,
            this.retryConfig.maxDelayMs
          );

          sdkLogger.warn('Retrying after error', {
            attempt: attempt + 1,
            delayMs,
            error: lastError.message,
          });

          await delay(delayMs);
          continue;
        }

        // No more retries or non-retryable error
        throw lastError;
      }
    }

    // Should not reach here, but TypeScript needs this
    throw lastError || new GenerationError('Generation failed after retries');
  }

  /**
   * Cache the generation result
   */
  private async cacheResult(
    cacheKey: string,
    imageUrl: string,
    onStatusUpdate?: StatusUpdateCallback
  ): Promise<string | null> {
    try {
      onStatusUpdate?.('Caching result...');
      await this.cacheManager.set(cacheKey, imageUrl);

      // Return cached URL for consistency
      const cachedUrl = await this.cacheManager.get(cacheKey);
      if (cachedUrl) {
        sdkLogger.debug('Result cached successfully');
        return cachedUrl;
      }
    } catch (cacheError) {
      sdkLogger.warn('Failed to cache image', { error: cacheError });
    }

    return null;
  }

  /**
   * Clear the local cache
   */
  async clearCache(): Promise<void> {
    sdkLogger.info('Clearing cache');
    await this.cacheManager.clear();
  }

  /**
   * Get cache statistics (if supported by cache manager)
   */
  async getCacheStats(): Promise<{ size: number } | null> {
    // This could be extended to provide more detailed stats
    return null;
  }

  /**
   * Destroy the client and clean up resources
   * Call this when you no longer need the client instance
   */
  destroy(): void {
    sdkLogger.info('Destroying SDK client');
    
    // Clean up cache manager resources if it has a destroy method
    if (this.cacheManager && 'destroy' in this.cacheManager && typeof this.cacheManager.destroy === 'function') {
      this.cacheManager.destroy();
    }
  }
}

// ============================================================================
// Factory Function for Custom Instances
// ============================================================================

/**
 * Create a new CharacterForge client instance
 *
 * @param config - Client configuration
 * @returns CharacterForgeClient instance
 *
 * @example
 * ```typescript
 * const client = createCharacterForgeClient({
 *   apiKey: 'your-api-key',
 *   cache: true,
 * });
 *
 * const imageUrl = await client.generate({
 *   gender: 'female',
 *   skinTone: 'medium',
 *   hairStyle: 'bob',
 *   hairColor: 'brown',
 *   clothing: 'hoodie',
 *   clothingColor: 'blue',
 *   eyeColor: 'brown',
 *   accessories: ['glasses'],
 *   transparent: true,
 * });
 * ```
 */
export function createCharacterForgeClient(
  config: CharacterForgeClientConfig
): CharacterForgeClient {
  return new CharacterForgeClient(config);
}

