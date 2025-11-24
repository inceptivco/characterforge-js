/**
 * React Native Cache Manager
 *
 * Implements caching for React Native using AsyncStorage for metadata
 * and file system for image storage.
 *
 * Note: This implementation requires expo-file-system or react-native-fs
 * to be installed in the host application.
 */

import type { CacheManager } from '../types';
import { cacheLogger } from '../logger';

// =============================================================================
// Constants
// =============================================================================

const CACHE_DIR = 'character-forge-cache/';
const MAX_CACHE_SIZE = 100;
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const METADATA_KEY = '@characterforge:cache-metadata';

// =============================================================================
// Types
// =============================================================================

interface CacheMetadata {
  [key: string]: {
    fileName: string;
    createdAt: number;
    accessedAt: number;
  };
}

// =============================================================================
// File System Adapter
// =============================================================================

/**
 * Adapter for different React Native file system implementations
 * This allows the SDK to work with both expo-file-system and react-native-fs
 */
interface FileSystemAdapter {
  documentDirectory: string;
  downloadAsync(url: string, fileUri: string): Promise<void>;
  writeAsStringAsync(fileUri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  readAsStringAsync(fileUri: string, options?: { encoding?: string }): Promise<string>;
  getInfoAsync(fileUri: string): Promise<{ exists: boolean; size?: number }>;
  makeDirectoryAsync(dirUri: string, options?: { intermediates?: boolean }): Promise<void>;
  deleteAsync(fileUri: string, options?: { idempotent?: boolean }): Promise<void>;
  readDirectoryAsync(dirUri: string): Promise<string[]>;
}

/**
 * Get the appropriate file system adapter
 */
function getFileSystemAdapter(): FileSystemAdapter | null {
  // Try expo-file-system first
  try {
    const ExpoFileSystem = require('expo-file-system');
    if (ExpoFileSystem?.documentDirectory) {
      return {
        documentDirectory: ExpoFileSystem.documentDirectory,
        downloadAsync: ExpoFileSystem.downloadAsync,
        writeAsStringAsync: ExpoFileSystem.writeAsStringAsync,
        readAsStringAsync: ExpoFileSystem.readAsStringAsync,
        getInfoAsync: ExpoFileSystem.getInfoAsync,
        makeDirectoryAsync: ExpoFileSystem.makeDirectoryAsync,
        deleteAsync: ExpoFileSystem.deleteAsync,
        readDirectoryAsync: ExpoFileSystem.readDirectoryAsync,
      };
    }
  } catch {
    // expo-file-system not available
  }

  // Try react-native-fs
  try {
    const RNFS = require('react-native-fs');
    if (RNFS?.DocumentDirectoryPath) {
      return {
        documentDirectory: RNFS.DocumentDirectoryPath + '/',
        downloadAsync: async (url: string, fileUri: string) => {
          await RNFS.downloadFile({ fromUrl: url, toFile: fileUri }).promise;
        },
        writeAsStringAsync: async (fileUri: string, contents: string) => {
          await RNFS.writeFile(fileUri, contents, 'utf8');
        },
        readAsStringAsync: async (fileUri: string) => {
          return await RNFS.readFile(fileUri, 'utf8');
        },
        getInfoAsync: async (fileUri: string) => {
          const exists = await RNFS.exists(fileUri);
          if (exists) {
            const stat = await RNFS.stat(fileUri);
            return { exists: true, size: stat.size };
          }
          return { exists: false };
        },
        makeDirectoryAsync: async (dirUri: string) => {
          await RNFS.mkdir(dirUri);
        },
        deleteAsync: async (fileUri: string) => {
          const exists = await RNFS.exists(fileUri);
          if (exists) {
            await RNFS.unlink(fileUri);
          }
        },
        readDirectoryAsync: async (dirUri: string) => {
          const files = await RNFS.readDir(dirUri);
          return files.map((file: any) => file.name);
        },
      };
    }
  } catch {
    // react-native-fs not available
  }

  return null;
}

/**
 * Get AsyncStorage adapter
 */
function getAsyncStorage(): any {
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    try {
      // Try legacy async storage
      return require('react-native').AsyncStorage;
    } catch {
      return null;
    }
  }
}

// =============================================================================
// React Native Cache Manager
// =============================================================================

export class NativeCacheManager implements CacheManager {
  private fs: FileSystemAdapter | null;
  private asyncStorage: any;
  private cacheDir: string;
  private isSupported: boolean;
  private metadata: CacheMetadata = {};
  private initPromise: Promise<void>;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.fs = getFileSystemAdapter();
    this.asyncStorage = getAsyncStorage();
    this.isSupported = !!(this.fs && this.asyncStorage);

    if (this.isSupported && this.fs) {
      this.cacheDir = this.fs.documentDirectory + CACHE_DIR;
      this.initPromise = this.initialize();
    } else {
      this.cacheDir = '';
      this.initPromise = Promise.resolve();
      cacheLogger.warn(
        'React Native cache not supported. Install expo-file-system or react-native-fs and @react-native-async-storage/async-storage.'
      );
    }
  }

  private async initialize(): Promise<void> {
    if (!this.fs) return;

    try {
      // Ensure cache directory exists
      const dirInfo = await this.fs.getInfoAsync(this.cacheDir);
      if (!dirInfo.exists) {
        await this.fs.makeDirectoryAsync(this.cacheDir, { intermediates: true });
      }

      // Load metadata
      await this.loadMetadata();

      // Schedule cleanup
      this.scheduleCleanup();
    } catch (error) {
      cacheLogger.error('Failed to initialize cache', error);
    }
  }

  private async loadMetadata(): Promise<void> {
    if (!this.asyncStorage) return;

    try {
      const data = await this.asyncStorage.getItem(METADATA_KEY);
      if (data) {
        this.metadata = JSON.parse(data);
      }
    } catch (error) {
      cacheLogger.warn('Failed to load cache metadata', { error });
      this.metadata = {};
    }
  }

  private async saveMetadata(): Promise<void> {
    if (!this.asyncStorage) return;

    try {
      await this.asyncStorage.setItem(METADATA_KEY, JSON.stringify(this.metadata));
    } catch (error) {
      cacheLogger.warn('Failed to save cache metadata', { error });
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isSupported || !this.fs) {
      return null;
    }

    // Wait for initialization to complete
    await this.initPromise;

    const entry = this.metadata[key];
    if (!entry) {
      return null;
    }

    // Check expiry
    if (Date.now() - entry.createdAt > CACHE_EXPIRY_MS) {
      await this.delete(key);
      return null;
    }

    const fileUri = this.cacheDir + entry.fileName;
    const fileInfo = await this.fs.getInfoAsync(fileUri);

    if (!fileInfo.exists) {
      delete this.metadata[key];
      await this.saveMetadata();
      return null;
    }

    // Update access time
    entry.accessedAt = Date.now();
    await this.saveMetadata();

    return fileUri;
  }

  async set(key: string, data: Blob | string): Promise<string> {
    if (!this.isSupported || !this.fs) {
      if (typeof data === 'string') return data;
      throw new Error('Cache not supported in this environment');
    }

    // Wait for initialization to complete
    await this.initPromise;

    // React Native cannot directly cache Blobs without conversion
    // Blobs would need to be converted to base64 or fetched as data URLs
    if (typeof data !== 'string') {
      cacheLogger.warn('Blob caching not supported in React Native. Use URL strings instead.');
      throw new Error('Blob caching not supported in React Native. Please provide a URL string instead.');
    }

    try {
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
      const fileUri = this.cacheDir + fileName;

      // Download from URL
      await this.fs.downloadAsync(data, fileUri);

      // Save metadata
      this.metadata[key] = {
        fileName,
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };
      await this.saveMetadata();
      await this.enforceLimit();

      return fileUri;
    } catch (error) {
      cacheLogger.warn('Cache storage failed', { error });
      // Return original URL as fallback
      return data;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isSupported || !this.fs) return;

    // Wait for initialization to complete
    await this.initPromise;

    const entry = this.metadata[key];
    if (!entry) return;

    try {
      const fileUri = this.cacheDir + entry.fileName;
      await this.fs.deleteAsync(fileUri, { idempotent: true });
    } catch (error) {
      cacheLogger.warn('Failed to delete cache file', { error });
    }

    delete this.metadata[key];
    await this.saveMetadata();
  }

  async clear(): Promise<void> {
    if (!this.isSupported || !this.fs) return;

    // Wait for initialization to complete
    await this.initPromise;

    try {
      // Delete all files
      const files = await this.fs.readDirectoryAsync(this.cacheDir);
      for (const file of files) {
        await this.fs.deleteAsync(this.cacheDir + file, { idempotent: true });
      }

      // Clear metadata
      this.metadata = {};
      await this.saveMetadata();
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
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  private async enforceLimit(): Promise<void> {
    const keys = Object.keys(this.metadata);
    if (keys.length <= MAX_CACHE_SIZE) return;

    // Sort by access time, oldest first
    const sortedKeys = keys.sort((a, b) => {
      return this.metadata[a]!.accessedAt - this.metadata[b]!.accessedAt;
    });

    // Delete oldest entries
    const toDelete = sortedKeys.slice(0, keys.length - MAX_CACHE_SIZE);
    for (const key of toDelete) {
      await this.delete(key);
    }
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
    if (!this.isSupported) return;

    const now = Date.now();
    const expiredKeys = Object.keys(this.metadata).filter(
      key => now - this.metadata[key]!.createdAt > CACHE_EXPIRY_MS
    );

    for (const key of expiredKeys) {
      await this.delete(key);
    }

    if (expiredKeys.length > 0) {
      cacheLogger.info(`Cleaned up ${expiredKeys.length} expired entries`);
    }
  }
}

