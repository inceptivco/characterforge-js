var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/logger.ts
var LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var isDevelopment = (() => {
  if (typeof window !== "undefined") {
    return true;
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env.NODE_ENV !== "production";
  }
  return true;
})();
var defaultConfig = {
  minLevel: isDevelopment ? "debug" : "warn",
  enableConsole: true
};
var Logger = class _Logger {
  constructor(config = {}) {
    this.config = { ...defaultConfig, ...config };
    this.context = config.context;
  }
  /**
   * Create a child logger with additional context
   */
  child(context) {
    return new _Logger({
      ...this.config,
      context: this.context ? `${this.context}:${context}` : context
    });
  }
  /**
   * Check if a log level should be output
   */
  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }
  /**
   * Format the log entry for console output
   */
  formatConsoleMessage(entry) {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`
    ];
    if (entry.context) {
      parts.push(`[${entry.context}]`);
    }
    parts.push(entry.message);
    return parts.join(" ");
  }
  /**
   * Core logging method
   */
  log(level, message, data, error) {
    if (!this.shouldLog(level)) {
      return;
    }
    const entry = {
      level,
      message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      context: this.context,
      data,
      error
    };
    if (this.config.enableConsole) {
      const formattedMessage = this.formatConsoleMessage(entry);
      const consoleMethod = level === "debug" ? "log" : level;
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
  debug(message, data) {
    this.log("debug", message, data);
  }
  /**
   * Info level logging - for general information
   */
  info(message, data) {
    this.log("info", message, data);
  }
  /**
   * Warning level logging - for potential issues
   */
  warn(message, data) {
    this.log("warn", message, data);
  }
  /**
   * Error level logging - for errors and exceptions
   */
  error(message, error, data) {
    const errorObj = error instanceof Error ? error : void 0;
    this.log("error", message, data, errorObj);
  }
  /**
   * Log with timing information
   */
  time(label) {
    const start = Date.now();
    this.debug(`Timer started: ${label}`);
    return () => {
      const duration = Date.now() - start;
      this.debug(`Timer ended: ${label}`, { durationMs: duration });
    };
  }
};
var logger = new Logger();
var sdkLogger = logger.child("SDK");
var apiLogger = logger.child("API");
var cacheLogger = logger.child("Cache");

// src/cache/web.ts
var DB_NAME = "CharacterForgeDB";
var STORE_NAME = "images";
var DB_VERSION = 2;
var MAX_CACHE_SIZE = 100;
var CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1e3;
var ObjectURLManager = class {
  constructor() {
    this.urls = /* @__PURE__ */ new Map();
  }
  create(key, blob) {
    this.revoke(key);
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    return url;
  }
  revoke(key) {
    const url = this.urls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.delete(key);
    }
  }
  revokeAll() {
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
  }
  get(key) {
    return this.urls.get(key);
  }
};
var WebCacheManager = class {
  constructor() {
    this.dbPromise = null;
    this.urlManager = new ObjectURLManager();
    this.cleanupIntervalId = null;
    this.isSupported = typeof window !== "undefined" && !!window.indexedDB;
    if (this.isSupported) {
      this.dbPromise = this.openDB();
      this.scheduleCleanup();
    }
  }
  openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB not supported"));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        cacheLogger.error("Failed to open database", request.error);
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        db.createObjectStore(STORE_NAME);
      };
    });
  }
  async get(key) {
    if (!this.isSupported || !this.dbPromise) {
      return null;
    }
    const existingUrl = this.urlManager.get(key);
    if (existingUrl) {
      this.updateAccessTime(key).catch(() => {
      });
      return existingUrl;
    }
    try {
      const db = await this.dbPromise;
      const entry = await this.getEntry(db, key);
      if (!entry) {
        return null;
      }
      if (Date.now() - entry.createdAt > CACHE_EXPIRY_MS) {
        await this.delete(key);
        return null;
      }
      const url = this.urlManager.create(key, entry.blob);
      this.updateAccessTime(key).catch(() => {
      });
      return url;
    } catch (error) {
      cacheLogger.warn("Cache retrieval failed", { error });
      return null;
    }
  }
  async set(key, data) {
    if (!this.isSupported || !this.dbPromise) {
      if (typeof data === "string") return data;
      return URL.createObjectURL(data);
    }
    try {
      const db = await this.dbPromise;
      let blob;
      if (typeof data === "string") {
        const response = await fetch(data);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        blob = await response.blob();
      } else {
        blob = data;
      }
      const entry = {
        blob,
        createdAt: Date.now(),
        accessedAt: Date.now()
      };
      await this.putEntry(db, key, entry);
      this.enforceLimit(db).catch(() => {
      });
      return this.urlManager.create(key, blob);
    } catch (error) {
      cacheLogger.warn("Cache storage failed", { error });
      if (typeof data === "string") return data;
      return URL.createObjectURL(data);
    }
  }
  async delete(key) {
    this.urlManager.revoke(key);
    if (!this.isSupported || !this.dbPromise) return;
    try {
      const db = await this.dbPromise;
      await this.deleteEntry(db, key);
    } catch (error) {
      cacheLogger.warn("Cache deletion failed", { error });
    }
  }
  async clear() {
    this.urlManager.revokeAll();
    if (!this.isSupported || !this.dbPromise) return;
    try {
      const db = await this.dbPromise;
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      cacheLogger.warn("Cache clear failed", { error });
    }
  }
  /**
   * Destroy the cache manager and clean up resources
   * Call this when you no longer need the cache instance
   */
  destroy() {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.urlManager.revokeAll();
  }
  // =============================================================================
  // Private Helpers
  // =============================================================================
  async getEntry(db, key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }
  async putEntry(db, key, entry) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
  async deleteEntry(db, key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
  async updateAccessTime(key) {
    if (!this.dbPromise) return;
    try {
      const db = await this.dbPromise;
      const entry = await this.getEntry(db, key);
      if (entry) {
        entry.accessedAt = Date.now();
        await this.putEntry(db, key, entry);
      }
    } catch {
    }
  }
  async enforceLimit(db) {
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
      cacheLogger.warn("Failed to enforce cache limit", { error });
    }
  }
  async getCount(db) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  async getOldestKeys(db, count) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const entries = [];
      const request = store.openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const entry = cursor.value;
          entries.push({
            key: cursor.key,
            accessedAt: entry.accessedAt
          });
          cursor.continue();
        } else {
          entries.sort((a, b) => a.accessedAt - b.accessedAt);
          const oldestKeys = entries.slice(0, count).map((e) => e.key);
          resolve(oldestKeys);
        }
      };
    });
  }
  scheduleCleanup() {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
    }
    this.cleanupIntervalId = setInterval(() => this.cleanup().catch(() => {
    }), 60 * 60 * 1e3);
  }
  async cleanup() {
    if (!this.dbPromise) return;
    try {
      const db = await this.dbPromise;
      const expiredKeys = [];
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const entry = cursor.value;
            if (Date.now() - entry.createdAt > CACHE_EXPIRY_MS) {
              expiredKeys.push(cursor.key);
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
      cacheLogger.warn("Cleanup failed", { error });
    }
  }
};

// src/cache/native.ts
var CACHE_DIR = "character-forge-cache/";
var MAX_CACHE_SIZE2 = 100;
var CACHE_EXPIRY_MS2 = 7 * 24 * 60 * 60 * 1e3;
var METADATA_KEY = "@characterforge:cache-metadata";
function getFileSystemAdapter() {
  try {
    const ExpoFileSystem = __require("expo-file-system");
    if (ExpoFileSystem?.documentDirectory) {
      return {
        documentDirectory: ExpoFileSystem.documentDirectory,
        downloadAsync: ExpoFileSystem.downloadAsync,
        writeAsStringAsync: ExpoFileSystem.writeAsStringAsync,
        readAsStringAsync: ExpoFileSystem.readAsStringAsync,
        getInfoAsync: ExpoFileSystem.getInfoAsync,
        makeDirectoryAsync: ExpoFileSystem.makeDirectoryAsync,
        deleteAsync: ExpoFileSystem.deleteAsync,
        readDirectoryAsync: ExpoFileSystem.readDirectoryAsync
      };
    }
  } catch {
  }
  try {
    const RNFS = __require("react-native-fs");
    if (RNFS?.DocumentDirectoryPath) {
      return {
        documentDirectory: RNFS.DocumentDirectoryPath + "/",
        downloadAsync: async (url, fileUri) => {
          await RNFS.downloadFile({ fromUrl: url, toFile: fileUri }).promise;
        },
        writeAsStringAsync: async (fileUri, contents) => {
          await RNFS.writeFile(fileUri, contents, "utf8");
        },
        readAsStringAsync: async (fileUri) => {
          return await RNFS.readFile(fileUri, "utf8");
        },
        getInfoAsync: async (fileUri) => {
          const exists = await RNFS.exists(fileUri);
          if (exists) {
            const stat = await RNFS.stat(fileUri);
            return { exists: true, size: stat.size };
          }
          return { exists: false };
        },
        makeDirectoryAsync: async (dirUri) => {
          await RNFS.mkdir(dirUri);
        },
        deleteAsync: async (fileUri) => {
          const exists = await RNFS.exists(fileUri);
          if (exists) {
            await RNFS.unlink(fileUri);
          }
        },
        readDirectoryAsync: async (dirUri) => {
          const files = await RNFS.readDir(dirUri);
          return files.map((file) => file.name);
        }
      };
    }
  } catch {
  }
  return null;
}
function getAsyncStorage() {
  try {
    return __require("@react-native-async-storage/async-storage").default;
  } catch {
    try {
      return __require("react-native").AsyncStorage;
    } catch {
      return null;
    }
  }
}
var NativeCacheManager = class {
  constructor() {
    this.metadata = {};
    this.cleanupIntervalId = null;
    this.fs = getFileSystemAdapter();
    this.asyncStorage = getAsyncStorage();
    this.isSupported = !!(this.fs && this.asyncStorage);
    if (this.isSupported && this.fs) {
      this.cacheDir = this.fs.documentDirectory + CACHE_DIR;
      this.initPromise = this.initialize();
    } else {
      this.cacheDir = "";
      this.initPromise = Promise.resolve();
      cacheLogger.warn(
        "React Native cache not supported. Install expo-file-system or react-native-fs and @react-native-async-storage/async-storage."
      );
    }
  }
  async initialize() {
    if (!this.fs) return;
    try {
      const dirInfo = await this.fs.getInfoAsync(this.cacheDir);
      if (!dirInfo.exists) {
        await this.fs.makeDirectoryAsync(this.cacheDir, { intermediates: true });
      }
      await this.loadMetadata();
      this.scheduleCleanup();
    } catch (error) {
      cacheLogger.error("Failed to initialize cache", error);
    }
  }
  async loadMetadata() {
    if (!this.asyncStorage) return;
    try {
      const data = await this.asyncStorage.getItem(METADATA_KEY);
      if (data) {
        this.metadata = JSON.parse(data);
      }
    } catch (error) {
      cacheLogger.warn("Failed to load cache metadata", { error });
      this.metadata = {};
    }
  }
  async saveMetadata() {
    if (!this.asyncStorage) return;
    try {
      await this.asyncStorage.setItem(METADATA_KEY, JSON.stringify(this.metadata));
    } catch (error) {
      cacheLogger.warn("Failed to save cache metadata", { error });
    }
  }
  async get(key) {
    if (!this.isSupported || !this.fs) {
      return null;
    }
    await this.initPromise;
    const entry = this.metadata[key];
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.createdAt > CACHE_EXPIRY_MS2) {
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
    entry.accessedAt = Date.now();
    await this.saveMetadata();
    return fileUri;
  }
  async set(key, data) {
    if (!this.isSupported || !this.fs) {
      if (typeof data === "string") return data;
      throw new Error("Cache not supported in this environment");
    }
    await this.initPromise;
    if (typeof data !== "string") {
      cacheLogger.warn("Blob caching not supported in React Native. Use URL strings instead.");
      throw new Error("Blob caching not supported in React Native. Please provide a URL string instead.");
    }
    try {
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
      const fileUri = this.cacheDir + fileName;
      await this.fs.downloadAsync(data, fileUri);
      this.metadata[key] = {
        fileName,
        createdAt: Date.now(),
        accessedAt: Date.now()
      };
      await this.saveMetadata();
      await this.enforceLimit();
      return fileUri;
    } catch (error) {
      cacheLogger.warn("Cache storage failed", { error });
      return data;
    }
  }
  async delete(key) {
    if (!this.isSupported || !this.fs) return;
    await this.initPromise;
    const entry = this.metadata[key];
    if (!entry) return;
    try {
      const fileUri = this.cacheDir + entry.fileName;
      await this.fs.deleteAsync(fileUri, { idempotent: true });
    } catch (error) {
      cacheLogger.warn("Failed to delete cache file", { error });
    }
    delete this.metadata[key];
    await this.saveMetadata();
  }
  async clear() {
    if (!this.isSupported || !this.fs) return;
    await this.initPromise;
    try {
      const files = await this.fs.readDirectoryAsync(this.cacheDir);
      for (const file of files) {
        await this.fs.deleteAsync(this.cacheDir + file, { idempotent: true });
      }
      this.metadata = {};
      await this.saveMetadata();
    } catch (error) {
      cacheLogger.warn("Cache clear failed", { error });
    }
  }
  /**
   * Destroy the cache manager and clean up resources
   * Call this when you no longer need the cache instance
   */
  destroy() {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
  // =============================================================================
  // Private Helpers
  // =============================================================================
  async enforceLimit() {
    const keys = Object.keys(this.metadata);
    if (keys.length <= MAX_CACHE_SIZE2) return;
    const sortedKeys = keys.sort((a, b) => {
      return this.metadata[a].accessedAt - this.metadata[b].accessedAt;
    });
    const toDelete = sortedKeys.slice(0, keys.length - MAX_CACHE_SIZE2);
    for (const key of toDelete) {
      await this.delete(key);
    }
  }
  scheduleCleanup() {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
    }
    this.cleanupIntervalId = setInterval(() => this.cleanup().catch(() => {
    }), 60 * 60 * 1e3);
  }
  async cleanup() {
    if (!this.isSupported) return;
    const now = Date.now();
    const expiredKeys = Object.keys(this.metadata).filter(
      (key) => now - this.metadata[key].createdAt > CACHE_EXPIRY_MS2
    );
    for (const key of expiredKeys) {
      await this.delete(key);
    }
    if (expiredKeys.length > 0) {
      cacheLogger.info(`Cleaned up ${expiredKeys.length} expired entries`);
    }
  }
};

// src/cache/index.ts
function isReactNative() {
  return typeof navigator !== "undefined" && navigator.product === "ReactNative";
}
function isBrowser() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}
function createCacheManager() {
  if (isReactNative()) {
    cacheLogger.debug("Creating React Native cache manager");
    return new NativeCacheManager();
  }
  if (isBrowser()) {
    cacheLogger.debug("Creating Web cache manager");
    return new WebCacheManager();
  }
  cacheLogger.warn("Platform not supported, using no-op cache");
  return new NoOpCacheManager();
}
var NoOpCacheManager = class {
  async get(_key) {
    return null;
  }
  async set(_key, data) {
    if (typeof data === "string") {
      return data;
    }
    throw new Error("Cache not supported in this environment");
  }
  async clear() {
  }
  async delete(_key) {
  }
  destroy() {
  }
};

// src/errors.ts
var AppError = class extends Error {
  constructor(message, code = "APP_ERROR", statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = /* @__PURE__ */ new Date();
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
      timestamp: this.timestamp.toISOString()
    };
  }
};
var AuthenticationError = class extends AppError {
  constructor(message = "Invalid or missing API key") {
    super(message, "AUTH_ERROR", 401);
  }
};
var AuthorizationError = class extends AppError {
  constructor(message = "Not authorized to perform this action") {
    super(message, "AUTHORIZATION_ERROR", 403);
  }
};
var InsufficientCreditsError = class extends AppError {
  constructor(required = 1, available = 0) {
    super(
      "Insufficient credits. Please purchase more credits to continue.",
      "INSUFFICIENT_CREDITS",
      402
    );
    this.required = required;
    this.available = available;
  }
};
var PaymentError = class extends AppError {
  constructor(message = "Payment processing failed") {
    super(message, "PAYMENT_ERROR", 402);
  }
};
var ApiError = class extends AppError {
  constructor(message, statusCode = 500, endpoint, code = "API_ERROR") {
    super(message, code, statusCode);
    this.endpoint = endpoint;
  }
};
var RateLimitError = class extends ApiError {
  constructor(retryAfter) {
    super("Too many requests. Please try again later.", 429, void 0, "RATE_LIMIT");
    this.retryAfter = retryAfter;
  }
};
var NetworkError = class extends AppError {
  constructor(message = "Network error. Please check your connection.") {
    super(message, "NETWORK_ERROR", 0);
  }
};
var GenerationError = class extends AppError {
  constructor(message = "Failed to generate character", code = "GENERATION_ERROR") {
    super(message, code, 500);
  }
};
var ImageProcessingError = class extends GenerationError {
  constructor(message = "Failed to process image") {
    super(message, "IMAGE_PROCESSING_ERROR");
  }
};
var ValidationError = class extends AppError {
  constructor(message, field, value, code = "VALIDATION_ERROR") {
    super(message, code, 400);
    this.field = field;
    this.value = value;
  }
};
var ConfigValidationError = class extends ValidationError {
  constructor(message, field) {
    super(message, field, void 0, "CONFIG_VALIDATION_ERROR");
  }
};
var CacheError = class extends AppError {
  constructor(message = "Cache operation failed") {
    super(message, "CACHE_ERROR", 500);
  }
};
function isAppError(error) {
  return error instanceof AppError;
}
function isAuthenticationError(error) {
  return error instanceof AuthenticationError;
}
function isInsufficientCreditsError(error) {
  return error instanceof InsufficientCreditsError;
}
function isNetworkError(error) {
  return error instanceof NetworkError;
}
function isRateLimitError(error) {
  return error instanceof RateLimitError;
}
function parseError(error) {
  if (isAppError(error)) {
    return error;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("api key") || message.includes("authentication")) {
      return new AuthenticationError(error.message);
    }
    if (message.includes("credits") || message.includes("insufficient")) {
      return new InsufficientCreditsError();
    }
    if (message.includes("network") || message.includes("fetch")) {
      return new NetworkError(error.message);
    }
    return new AppError(error.message);
  }
  if (typeof error === "string") {
    return new AppError(error);
  }
  return new AppError("An unexpected error occurred");
}
function getUserFriendlyMessage(error) {
  const appError = parseError(error);
  const friendlyMessages = {
    AUTH_ERROR: "Invalid API key. Please check your credentials.",
    INSUFFICIENT_CREDITS: "You need more credits. Purchase credits to continue.",
    RATE_LIMIT: "You're doing that too fast. Please wait a moment.",
    NETWORK_ERROR: "Connection problem. Please check your internet.",
    GENERATION_ERROR: "Unable to create your character. Please try again."
  };
  return friendlyMessages[appError.code] || appError.message;
}

// src/client.ts
var DEFAULT_BASE_URL = "https://mnxzykltetirdcnxugcl.supabase.co/functions/v1";
var DEFAULT_TIMEOUT = 6e4;
var DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1e3,
  maxDelayMs: 1e4
};
var RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
function generateCacheKey(config) {
  const sortedKeys = Object.keys(config).sort();
  const stableObj = {};
  for (const key of sortedKeys) {
    if (key === "cache") continue;
    const value = config[key];
    if (value !== void 0) {
      stableObj[key] = value;
    }
  }
  return JSON.stringify(stableObj);
}
function calculateBackoffDelay(attempt, baseDelay, maxDelay) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelay);
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRetryableError(error) {
  if (error instanceof NetworkError) return true;
  if (error instanceof RateLimitError) return true;
  if (error instanceof ApiError) return true;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("network") || message.includes("timeout") || message.includes("fetch") || message.includes("failed to fetch");
  }
  return false;
}
function parseHttpError(status, data) {
  const errorData = data;
  const message = errorData.error || "An unexpected error occurred";
  if (status === 401 || message.toLowerCase().includes("api key")) {
    return new AuthenticationError(message);
  }
  if (status === 402 || message.toLowerCase().includes("credits")) {
    return new InsufficientCreditsError();
  }
  if (status === 429) {
    return new RateLimitError();
  }
  if (RETRYABLE_STATUS_CODES.includes(status)) {
    return new ApiError(message, status, "generate-character");
  }
  return new GenerationError(message);
}
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkError("Request timeout");
    }
    throw error;
  }
}
var CharacterForgeClient = class {
  constructor(config) {
    if (!config.apiKey) {
      throw new AuthenticationError("API key is required");
    }
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
      cache: config.cache ?? true,
      cacheManager: config.cacheManager || createCacheManager(),
      timeout: config.timeout || DEFAULT_TIMEOUT,
      retry: config.retry || DEFAULT_RETRY_CONFIG
    };
    this.retryConfig = this.config.retry;
    this.cacheManager = this.config.cacheManager;
    sdkLogger.info("SDK Client initialized", {
      cacheEnabled: this.config.cache,
      baseUrl: this.config.baseUrl
    });
  }
  /**
   * Generate a character image based on the configuration
   * Includes caching, retry logic, and comprehensive error handling
   */
  async generate(characterConfig, onStatusUpdate) {
    const shouldCache = this.config.cache && characterConfig.cache !== false;
    const cacheKey = generateCacheKey(characterConfig);
    sdkLogger.debug("Starting generation", {
      shouldCache,
      gender: characterConfig.gender
    });
    if (shouldCache) {
      try {
        const cachedUrl = await this.cacheManager.get(cacheKey);
        if (cachedUrl) {
          sdkLogger.info("Cache hit");
          onStatusUpdate?.("Retrieved from Client Cache!");
          return cachedUrl;
        }
        sdkLogger.debug("Cache miss");
      } catch (cacheError) {
        sdkLogger.warn("Cache lookup failed", { error: cacheError });
      }
    }
    onStatusUpdate?.("Calling AI Cloud...");
    const imageUrl = await this.callApiWithRetry(characterConfig);
    if (shouldCache && imageUrl) {
      const cachedUrl = await this.cacheResult(cacheKey, imageUrl, onStatusUpdate);
      if (cachedUrl) {
        sdkLogger.debug("Returning local cached URL");
        return cachedUrl;
      }
    }
    return imageUrl;
  }
  /**
   * Call the generation API with retry logic
   */
  async callApiWithRetry(config) {
    let lastError = null;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        sdkLogger.debug("API call attempt", { attempt: attempt + 1 });
        const url = `${this.config.baseUrl}/generate-character`;
        const response = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify(config)
          },
          this.config.timeout
        );
        if (!response.ok) {
          const data2 = await response.json();
          const error = parseHttpError(response.status, data2);
          throw error;
        }
        const data = await response.json();
        if (!data.image) {
          throw new GenerationError("No image URL in response");
        }
        sdkLogger.info("Generation successful", {
          attempt: attempt + 1
        });
        return data.image;
      } catch (error) {
        lastError = error instanceof Error ? error : new GenerationError("Unknown error");
        if (lastError instanceof AuthenticationError || lastError instanceof InsufficientCreditsError) {
          throw lastError;
        }
        if (attempt < this.retryConfig.maxRetries && isRetryableError(error)) {
          const delayMs = calculateBackoffDelay(
            attempt,
            this.retryConfig.baseDelayMs,
            this.retryConfig.maxDelayMs
          );
          sdkLogger.warn("Retrying after error", {
            attempt: attempt + 1,
            delayMs,
            error: lastError.message
          });
          await delay(delayMs);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new GenerationError("Generation failed after retries");
  }
  /**
   * Cache the generation result
   */
  async cacheResult(cacheKey, imageUrl, onStatusUpdate) {
    try {
      onStatusUpdate?.("Caching result...");
      await this.cacheManager.set(cacheKey, imageUrl);
      const cachedUrl = await this.cacheManager.get(cacheKey);
      if (cachedUrl) {
        sdkLogger.debug("Result cached successfully");
        return cachedUrl;
      }
    } catch (cacheError) {
      sdkLogger.warn("Failed to cache image", { error: cacheError });
    }
    return null;
  }
  /**
   * Clear the local cache
   */
  async clearCache() {
    sdkLogger.info("Clearing cache");
    await this.cacheManager.clear();
  }
  /**
   * Get cache statistics (if supported by cache manager)
   */
  async getCacheStats() {
    return null;
  }
  /**
   * Destroy the client and clean up resources
   * Call this when you no longer need the client instance
   */
  destroy() {
    sdkLogger.info("Destroying SDK client");
    if (this.cacheManager && "destroy" in this.cacheManager && typeof this.cacheManager.destroy === "function") {
      this.cacheManager.destroy();
    }
  }
};
function createCharacterForgeClient(config) {
  return new CharacterForgeClient(config);
}

// src/index.ts
var VERSION = "1.0.0";
export {
  ApiError,
  AppError,
  AuthenticationError,
  AuthorizationError,
  CacheError,
  CharacterForgeClient,
  GenerationError as CharacterForgeError,
  ConfigValidationError,
  GenerationError,
  ImageProcessingError,
  InsufficientCreditsError,
  Logger,
  NativeCacheManager,
  NetworkError,
  PaymentError,
  RateLimitError,
  VERSION,
  ValidationError,
  WebCacheManager,
  createCacheManager,
  createCharacterForgeClient,
  getUserFriendlyMessage,
  isAppError,
  isAuthenticationError,
  isBrowser,
  isInsufficientCreditsError,
  isNetworkError,
  isRateLimitError,
  isReactNative,
  logger,
  parseError,
  sdkLogger
};
