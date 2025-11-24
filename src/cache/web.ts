/**
 * Web Cache Manager
 *
 * Implements caching using IndexedDB for persistent storage of generated images.
 * Properly manages Object URLs to prevent memory leaks.
 */

import type { CacheManager } from '../types';
import { cacheLogger } from '../logger';

// =============================================================================
// Constants
// =============================================================================

const DB_NAME = 'CharacterForgeDB';
const STORE_NAME = 'images';
const DB_VERSION = 2;
const MAX_CACHE_SIZE = 100;
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// =============================================================================
// Types
// =============================================================================

interface CacheEntry {
  blob: Blob;
  createdAt: number;
  accessedAt: number;
}

// =============================================================================
// Object URL Manager - Prevents memory leaks
// =============================================================================

class ObjectURLManager {
  private urls: Map<string, string> = new Map();

  create(key: string, blob: Blob): string {
    this.revoke(key);
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    return url;
  }

  revoke(key: string): void {
    const url = this.urls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.delete(key);
    }
  }

  revokeAll(): void {
    this.urls.forEach(url => URL.revokeObjectURL(url));
    this.urls.clear();
  }

  get(key: string): string | undefined {
    return this.urls.get(key);
  }
}

// =============================================================================
// Web Cache Manager
// =============================================================================

export class WebCacheManager implements CacheManager {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private urlManager: ObjectURLManager = new ObjectURLManager();
  private isSupported: boolean;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.isSupported = typeof window !== 'undefined' && !!window.indexedDB;

    if (this.isSupported) {
      this.dbPromise = this.openDB();
      this.scheduleCleanup();
    }
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        cacheLogger.error('Failed to open database', request.error);
        reject(request.error);
      };

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Delete old store if it exists (schema migration)
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }

        db.createObjectStore(STORE_NAME);
      };
    });
  }

  async get(key: string): Promise<string | null> {
    if (!this.isSupported || !this.dbPromise) {
      return null;
    }

    // Return existing Object URL if available
    const existingUrl = this.urlManager.get(key);
    if (existingUrl) {
      this.updateAccessTime(key).catch(() => {});
      return existingUrl;
    }

    try {
      const db = await this.dbPromise;
      const entry = await this.getEntry(db, key);

      if (!entry) {
        return null;
      }

      // Check expiry
      if (Date.now() - entry.createdAt > CACHE_EXPIRY_MS) {
        await this.delete(key);
        return null;
      }

      const url = this.urlManager.create(key, entry.blob);
      this.updateAccessTime(key).catch(() => {});
      return url;
    } catch (error) {
      cacheLogger.warn('Cache retrieval failed', { error });
      return null;
    }
  }

  async set(key: string, data: Blob | string): Promise<string> {
    if (!this.isSupported || !this.dbPromise) {
      if (typeof data === 'string') return data;
      return URL.createObjectURL(data);
    }

    try {
      const db = await this.dbPromise;

      let blob: Blob;
      if (typeof data === 'string') {
        const response = await fetch(data);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        blob = await response.blob();
      } else {
        blob = data;
      }

      const entry: CacheEntry = {
        blob,
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };

      await this.putEntry(db, key, entry);
      this.enforceLimit(db).catch(() => {});

      return this.urlManager.create(key, blob);
    } catch (error) {
      cacheLogger.warn('Cache storage failed', { error });
      if (typeof data === 'string') return data;
      return URL.createObjectURL(data);
    }
  }

  async delete(key: string): Promise<void> {
    this.urlManager.revoke(key);

    if (!this.isSupported || !this.dbPromise) return;

    try {
      const db = await this.dbPromise;
      await this.deleteEntry(db, key);
    } catch (error) {
      cacheLogger.warn('Cache deletion failed', { error });
    }
  }

  async clear(): Promise<void> {
    this.urlManager.revokeAll();

    if (!this.isSupported || !this.dbPromise) return;

    try {
      const db = await this.dbPromise;
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      cacheLogger.warn('Cache clear failed', { error });
    }
  }

  /**
   * Destroy the cache manager and clean up resources
   * Call this when you no longer need the cache instance
   */
  destroy(): void {
    // Clear the cleanup interval
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    // Revoke all object URLs
    this.urlManager.revokeAll();
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  private async getEntry(db: IDBDatabase, key: string): Promise<CacheEntry | null> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  private async putEntry(db: IDBDatabase, key: string, entry: CacheEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async deleteEntry(db: IDBDatabase, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async updateAccessTime(key: string): Promise<void> {
    if (!this.dbPromise) return;
    try {
      const db = await this.dbPromise;
      const entry = await this.getEntry(db, key);
      if (entry) {
        entry.accessedAt = Date.now();
        await this.putEntry(db, key, entry);
      }
    } catch { /* ignore */ }
  }

  private async enforceLimit(db: IDBDatabase): Promise<void> {
    try {
      const count = await this.getCount(db);
      if (count > MAX_CACHE_SIZE) {
        const keysToDelete = await this.getOldestKeys(db, count - MAX_CACHE_SIZE);
        for (const key of keysToDelete) {
          this.urlManager.revoke(key);
          await this.deleteEntry(db, key);
        }
      }
    } catch (error) {
      cacheLogger.warn('Failed to enforce cache limit', { error });
    }
  }

  private async getCount(db: IDBDatabase): Promise<number> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  private async getOldestKeys(db: IDBDatabase, count: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const entries: Array<{ key: string; accessedAt: number }> = [];
      const request = store.openCursor();

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const entry = cursor.value as CacheEntry;
          entries.push({
            key: cursor.key as string,
            accessedAt: entry.accessedAt,
          });
          cursor.continue();
        } else {
          // Sort by accessedAt (oldest first) and return the oldest N keys
          entries.sort((a, b) => a.accessedAt - b.accessedAt);
          const oldestKeys = entries.slice(0, count).map(e => e.key);
          resolve(oldestKeys);
        }
      };
    });
  }

  private scheduleCleanup(): void {
    // Clear any existing interval first
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
    }

    // Run cleanup every hour
    this.cleanupIntervalId = setInterval(() => this.cleanup().catch(() => {}), 60 * 60 * 1000);
  }

  private async cleanup(): Promise<void> {
    if (!this.dbPromise) return;

    try {
      const db = await this.dbPromise;
      const expiredKeys: string[] = [];

      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const entry = cursor.value as CacheEntry;
            if (Date.now() - entry.createdAt > CACHE_EXPIRY_MS) {
              expiredKeys.push(cursor.key as string);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

      for (const key of expiredKeys) {
        await this.delete(key);
      }

      if (expiredKeys.length > 0) {
        cacheLogger.info(`Cleaned up ${expiredKeys.length} expired entries`);
      }
    } catch (error) {
      cacheLogger.warn('Cleanup failed', { error });
    }
  }
}

