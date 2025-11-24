/**
 * Cache Manager Exports
 *
 * Provides platform-specific cache managers and automatic platform detection.
 */

import type { CacheManager } from '../types';
import { WebCacheManager } from './web';
import { NativeCacheManager } from './native';
import { cacheLogger } from '../logger';

/**
 * Detect if running in React Native environment
 */
export function isReactNative(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.product === 'ReactNative'
  );
}

/**
 * Detect if running in a browser environment
 */
export function isBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.document !== 'undefined'
  );
}

/**
 * Create a cache manager appropriate for the current platform
 */
export function createCacheManager(): CacheManager {
  if (isReactNative()) {
    cacheLogger.debug('Creating React Native cache manager');
    return new NativeCacheManager();
  }

  if (isBrowser()) {
    cacheLogger.debug('Creating Web cache manager');
    return new WebCacheManager();
  }

  // Fallback to no-op cache for unsupported environments
  cacheLogger.warn('Platform not supported, using no-op cache');
  return new NoOpCacheManager();
}

/**
 * No-op cache manager for unsupported platforms
 */
class NoOpCacheManager implements CacheManager {
  async get(_key: string): Promise<string | null> {
    return null;
  }

  async set(_key: string, data: Blob | string): Promise<string> {
    if (typeof data === 'string') {
      return data;
    }
    throw new Error('Cache not supported in this environment');
  }

  async clear(): Promise<void> {
    // No-op
  }

  async delete(_key: string): Promise<void> {
    // No-op
  }

  destroy(): void {
    // No-op
  }
}

// Export cache managers
export { WebCacheManager } from './web';
export { NativeCacheManager } from './native';
export { NoOpCacheManager };

