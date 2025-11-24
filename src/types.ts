/**
 * Type Definitions for CharacterForge SDK
 *
 * This file contains all type definitions for the SDK.
 */

// ============================================================================
// Character Configuration Types
// ============================================================================

export type Gender = 'male' | 'female';

export type AgeGroupId = 'kid' | 'preteen' | 'teen' | 'young_adult' | 'adult';

export type SkinToneId =
  | 'porcelain'
  | 'fair'
  | 'light'
  | 'medium'
  | 'olive'
  | 'brown'
  | 'dark'
  | 'deep';

export type EyeColorId =
  | 'dark'
  | 'brown'
  | 'blue'
  | 'green'
  | 'hazel'
  | 'grey';

export type HairStyleId =
  | 'bob'
  | 'ponytail'
  | 'buns'
  | 'long'
  | 'pixie'
  | 'undercut'
  | 'quiff'
  | 'sidepart'
  | 'buzz'
  | 'combover'
  | 'messy'
  | 'afro'
  | 'curly';

export type HairColorId =
  | 'black'
  | 'dark_brown'
  | 'brown'
  | 'auburn'
  | 'ginger'
  | 'dark_blonde'
  | 'blonde'
  | 'platinum'
  | 'grey'
  | 'white'
  | 'blue'
  | 'purple';

export type ClothingItemId =
  | 'tshirt'
  | 'hoodie'
  | 'sweater'
  | 'jacket'
  | 'tank'
  | 'dress'
  | 'blouse'
  | 'polo'
  | 'buttonup'
  | 'henley';

export type ClothingColorId =
  | 'white'
  | 'black'
  | 'navy'
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'teal';

export type AccessoryId =
  | 'none'
  | 'glasses'
  | 'sunglasses'
  | 'headphones'
  | 'cap'
  | 'beanie';

/**
 * Character configuration object
 */
export interface CharacterConfig {
  /** Gender of the character */
  gender: Gender;
  /** Age group of the character (optional) */
  ageGroup?: AgeGroupId;
  /** Skin tone */
  skinTone: SkinToneId;
  /** Hair style */
  hairStyle: HairStyleId;
  /** Hair color */
  hairColor: HairColorId;
  /** Clothing type */
  clothing: ClothingItemId;
  /** Clothing color */
  clothingColor: ClothingColorId;
  /** Eye color */
  eyeColor: EyeColorId;
  /** Accessories (can be empty array or contain multiple items) */
  accessories: AccessoryId[];
  /** Whether to generate with transparent background (default: true) */
  transparent: boolean;
  /** Whether to use client-side caching for this generation (default: true) */
  cache?: boolean;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Interface for cache manager implementations
 * Allows different storage backends (IndexedDB, AsyncStorage, etc.)
 */
export interface CacheManager {
  /**
   * Get a cached value by key
   * @returns The cached URL or null if not found
   */
  get(key: string): Promise<string | null>;

  /**
   * Store a value in the cache
   * @param key - The cache key
   * @param data - The image data (Blob or URL string)
   * @returns The local URL for the cached data
   */
  set(key: string, data: Blob | string): Promise<string>;

  /**
   * Clear all cached data
   */
  clear(): Promise<void>;

  /**
   * Delete a specific cached item (optional)
   */
  delete?(key: string): Promise<void>;

  /**
   * Destroy the cache manager and clean up resources (optional)
   * Call this when you no longer need the cache instance
   */
  destroy?(): void;
}

// ============================================================================
// SDK Client Configuration
// ============================================================================

/**
 * Configuration options for the SDK client
 */
export interface CharacterForgeClientConfig {
  /** API key for authentication (required) */
  apiKey: string;
  /** Base URL for the API (optional, defaults to production) */
  baseUrl?: string;
  /** Enable/disable client-side caching (default: true) */
  cache?: boolean;
  /** Custom cache manager implementation */
  cacheManager?: CacheManager;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Retry configuration */
  retry?: RetryConfig;
}

/**
 * Retry configuration for API calls
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs: number;
}

// ============================================================================
// Generation Types
// ============================================================================

/**
 * Result of a character generation
 */
export interface GenerationResult {
  /** URL to the generated image (local blob URL or remote URL) */
  image: string;
  /** Whether the result was retrieved from cache */
  cached: boolean;
  /** Time taken for generation in milliseconds (if not cached) */
  durationMs?: number;
}

/**
 * Status update callback for tracking generation progress
 */
export type StatusUpdateCallback = (status: string) => void;

/**
 * Detailed status update with progress information
 */
export interface DetailedStatus {
  stage: 'initiating' | 'generating' | 'processing' | 'caching' | 'complete' | 'error';
  message: string;
  progress?: number;
  error?: string;
}

export type DetailedStatusCallback = (status: DetailedStatus) => void;

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from the generation API
 */
export interface GenerationApiResponse {
  /** URL to the generated image */
  image: string;
}

/**
 * Error response from the API
 */
export interface ApiErrorResponse {
  /** Error message */
  error: string;
  /** Error code (optional) */
  code?: string;
}

