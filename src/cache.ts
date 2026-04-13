/**
 * Simple in-memory cache with TTL (Time-To-Live) expiration.
 * Used to avoid repeated disk reads and JSON parsing on every hover.
 */
export class Cache<T> {
    private store = new Map<string, { value: T; expiry: number }>();
    private readonly ttlMs: number;

    /**
     * @param ttlSeconds Cache entry lifetime in seconds. Default: 30s.
     */
    constructor(ttlSeconds: number = 30) {
        this.ttlMs = ttlSeconds * 1000;
    }

    /**
     * Get a cached value by key. Returns undefined if not found or expired.
     */
    get(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) {
            return undefined;
        }
        if (Date.now() > entry.expiry) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    /**
     * Set a value in the cache.
     */
    set(key: string, value: T): void {
        this.store.set(key, {
            value,
            expiry: Date.now() + this.ttlMs,
        });
    }

    /**
     * Check if a key exists and is not expired.
     */
    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * Clear all cached entries.
     */
    clear(): void {
        this.store.clear();
    }

    /**
     * Remove expired entries to free memory.
     */
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.expiry) {
                this.store.delete(key);
            }
        }
    }
}

// --- Shared cache instances ---

/** Cache for Agent directory lookups: filePath → agentDirPath */
export const agentDirCache = new Cache<string | null>(60);

/** Cache for function definition files: functionFilePath → parsed JSON */
export const functionFileCache = new Cache<any>(30);

/** Cache for $ref resolved data: refPath → resolved JSON */
export const refCache = new Cache<any>(30);

/** Cache for parsed document: documentUri+version → parsed JSON */
export const documentCache = new Cache<any>(10);
