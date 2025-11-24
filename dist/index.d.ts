type Gender = 'male' | 'female';
type AgeGroupId = 'kid' | 'preteen' | 'teen' | 'young_adult' | 'adult';
type SkinToneId = 'porcelain' | 'fair' | 'light' | 'medium' | 'olive' | 'brown' | 'dark' | 'deep';
type EyeColorId = 'dark' | 'brown' | 'blue' | 'green' | 'hazel' | 'grey';
type HairStyleId = 'bob' | 'ponytail' | 'buns' | 'long' | 'pixie' | 'undercut' | 'quiff' | 'sidepart' | 'buzz' | 'combover' | 'messy' | 'afro' | 'curly';
type HairColorId = 'black' | 'dark_brown' | 'brown' | 'auburn' | 'ginger' | 'dark_blonde' | 'blonde' | 'platinum' | 'grey' | 'white' | 'blue' | 'purple';
type ClothingItemId = 'tshirt' | 'hoodie' | 'sweater' | 'jacket' | 'tank' | 'dress' | 'blouse' | 'polo' | 'buttonup' | 'henley';
type ClothingColorId = 'white' | 'black' | 'navy' | 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'pink' | 'orange' | 'teal';
type AccessoryId = 'none' | 'glasses' | 'sunglasses' | 'headphones' | 'cap' | 'beanie';
interface CharacterConfig {
    gender: Gender;
    ageGroup?: AgeGroupId;
    skinTone: SkinToneId;
    hairStyle: HairStyleId;
    hairColor: HairColorId;
    clothing: ClothingItemId;
    clothingColor: ClothingColorId;
    eyeColor: EyeColorId;
    accessories: AccessoryId[];
    transparent: boolean;
    cache?: boolean;
}
interface CacheManager {
    get(key: string): Promise<string | null>;
    set(key: string, data: Blob | string): Promise<string>;
    clear(): Promise<void>;
    delete?(key: string): Promise<void>;
    destroy?(): void;
}
interface CharacterForgeClientConfig {
    apiKey: string;
    baseUrl?: string;
    cache?: boolean;
    cacheManager?: CacheManager;
    timeout?: number;
    retry?: RetryConfig;
}
interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}
interface GenerationResult {
    image: string;
    cached: boolean;
    durationMs?: number;
}
type StatusUpdateCallback = (status: string) => void;
interface DetailedStatus {
    stage: 'initiating' | 'generating' | 'processing' | 'caching' | 'complete' | 'error';
    message: string;
    progress?: number;
    error?: string;
}
type DetailedStatusCallback = (status: DetailedStatus) => void;
interface GenerationApiResponse {
    image: string;
}
interface ApiErrorResponse {
    error: string;
    code?: string;
}

declare class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly isOperational: boolean;
    readonly timestamp: Date;
    constructor(message: string, code?: string, statusCode?: number, isOperational?: boolean);
    toJSON(): {
        name: string;
        message: string;
        code: string;
        statusCode: number;
        timestamp: string;
    };
}
declare class AuthenticationError extends AppError {
    constructor(message?: string);
}
declare class AuthorizationError extends AppError {
    constructor(message?: string);
}
declare class InsufficientCreditsError extends AppError {
    readonly required: number;
    readonly available: number;
    constructor(required?: number, available?: number);
}
declare class PaymentError extends AppError {
    constructor(message?: string);
}
declare class ApiError extends AppError {
    readonly endpoint?: string;
    constructor(message: string, statusCode?: number, endpoint?: string, code?: string);
}
declare class RateLimitError extends ApiError {
    readonly retryAfter?: number;
    constructor(retryAfter?: number);
}
declare class NetworkError extends AppError {
    constructor(message?: string);
}
declare class GenerationError extends AppError {
    constructor(message?: string, code?: string);
}
declare class ImageProcessingError extends GenerationError {
    constructor(message?: string);
}
declare class ValidationError extends AppError {
    readonly field?: string;
    readonly value?: unknown;
    constructor(message: string, field?: string, value?: unknown, code?: string);
}
declare class ConfigValidationError extends ValidationError {
    constructor(message: string, field?: string);
}
declare class CacheError extends AppError {
    constructor(message?: string);
}
declare function isAppError(error: unknown): error is AppError;
declare function isAuthenticationError(error: unknown): error is AuthenticationError;
declare function isInsufficientCreditsError(error: unknown): error is InsufficientCreditsError;
declare function isNetworkError(error: unknown): error is NetworkError;
declare function isRateLimitError(error: unknown): error is RateLimitError;
declare function parseError(error: unknown): AppError;
declare function getUserFriendlyMessage(error: unknown): string;

declare class CharacterForgeClient {
    private cacheManager;
    private config;
    private retryConfig;
    constructor(config: CharacterForgeClientConfig);
    generate(characterConfig: CharacterConfig, onStatusUpdate?: StatusUpdateCallback): Promise<string>;
    private callApiWithRetry;
    private cacheResult;
    clearCache(): Promise<void>;
    getCacheStats(): Promise<{
        size: number;
    } | null>;
    destroy(): void;
}
declare function createCharacterForgeClient(config: CharacterForgeClientConfig): CharacterForgeClient;

declare class WebCacheManager implements CacheManager {
    private dbPromise;
    private urlManager;
    private isSupported;
    private cleanupIntervalId;
    constructor();
    private openDB;
    get(key: string): Promise<string | null>;
    set(key: string, data: Blob | string): Promise<string>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    destroy(): void;
    private getEntry;
    private putEntry;
    private deleteEntry;
    private updateAccessTime;
    private enforceLimit;
    private getCount;
    private getOldestKeys;
    private scheduleCleanup;
    private cleanup;
}

declare class NativeCacheManager implements CacheManager {
    private fs;
    private asyncStorage;
    private cacheDir;
    private isSupported;
    private metadata;
    private initPromise;
    private cleanupIntervalId;
    constructor();
    private initialize;
    private loadMetadata;
    private saveMetadata;
    get(key: string): Promise<string | null>;
    set(key: string, data: Blob | string): Promise<string>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    destroy(): void;
    private enforceLimit;
    private scheduleCleanup;
    private cleanup;
}

declare function isReactNative(): boolean;
declare function isBrowser(): boolean;
declare function createCacheManager(): CacheManager;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    context?: string;
    data?: Record<string, unknown>;
    error?: Error;
}
interface LoggerConfig {
    minLevel: LogLevel;
    enableConsole: boolean;
    context?: string;
}
declare class Logger {
    private config;
    private context?;
    constructor(config?: Partial<LoggerConfig>);
    child(context: string): Logger;
    private shouldLog;
    private formatConsoleMessage;
    private log;
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
    time(label: string): () => void;
}
declare const logger: Logger;
declare const sdkLogger: Logger;

declare const VERSION = "1.0.0";

export { type AccessoryId, type AgeGroupId, ApiError, type ApiErrorResponse, AppError, AuthenticationError, AuthorizationError, CacheError, type CacheManager, type CharacterConfig, CharacterForgeClient, type CharacterForgeClientConfig, GenerationError as CharacterForgeError, type ClothingColorId, type ClothingItemId, ConfigValidationError, type DetailedStatus, type DetailedStatusCallback, type EyeColorId, type Gender, type GenerationApiResponse, GenerationError, type GenerationResult, type HairColorId, type HairStyleId, ImageProcessingError, InsufficientCreditsError, type LogEntry, type LogLevel, Logger, type LoggerConfig, NativeCacheManager, NetworkError, PaymentError, RateLimitError, type RetryConfig, type SkinToneId, type StatusUpdateCallback, VERSION, ValidationError, WebCacheManager, createCacheManager, createCharacterForgeClient, getUserFriendlyMessage, isAppError, isAuthenticationError, isBrowser, isInsufficientCreditsError, isNetworkError, isRateLimitError, isReactNative, logger, parseError, sdkLogger };
