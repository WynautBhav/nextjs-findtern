/**
 * Tiny in-memory LRU for instant-query results, keyed by normalised query string.
 *
 *   - `get` marks the entry most-recently-used and says whether it is still fresh
 *     (younger than `staleMs`). A stale entry is still returned: the caller shows it
 *     and revalidates (stale-while-revalidate).
 *   - `invalidate(prefix)` drops entries whose key starts with the prefix (no argument = all).
 *     Call it after a mutation; the caller refetches what is on screen.
 *   - No persistence. Module state is only created lazily on first use in the browser
 *     (`getCache`), so importing this file on the server holds nothing between requests.
 *
 * Pure: no React, no DOM, clock injectable for tests.
 */

export interface CacheEntry<T> {
  data: T;
  /** Epoch ms the entry was stored. */
  at: number;
}

export interface CacheHit<T> extends CacheEntry<T> {
  /** Younger than `staleMs` at the time of the read. */
  fresh: boolean;
}

export interface InstantCacheOptions {
  /** Entries kept before the least recently used one is evicted. Default 30. */
  max?: number;
  /** Age (ms) after which a hit is stale and must be revalidated. Default 30 000. */
  staleMs?: number;
  now?: () => number;
}

export const DEFAULT_MAX = 30;
export const DEFAULT_STALE_MS = 30_000;

/**
 * Canonical form of a query string: no leading `?`, keys sorted, order of repeated keys kept,
 * empty values kept (the server may treat `page=` and no `page` differently).
 * `"?b=2&a=1"`, `"a=1&b=2"` and `new URLSearchParams({ b: "2", a: "1" })` all give `"a=1&b=2"`.
 */
export function normaliseQuery(input: string | URLSearchParams | null | undefined): string {
  const params = input instanceof URLSearchParams ? new URLSearchParams(input) : new URLSearchParams(input ?? "");
  const entries = [...params.entries()];
  // Array.prototype.sort is stable: values of one key keep their relative order.
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return new URLSearchParams(entries).toString();
}

/** The query part of `/path?x=1#hash`, `?x=1` or `x=1`, normalised. */
export function queryOf(hrefOrQuery: string): string {
  const q = hrefOrQuery.includes("?") ? hrefOrQuery.slice(hrefOrQuery.indexOf("?") + 1) : hrefOrQuery.startsWith("/") ? "" : hrefOrQuery;
  const hash = q.indexOf("#");
  return normaliseQuery(hash >= 0 ? q.slice(0, hash) : q);
}

export class InstantCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>(); // insertion order = LRU order, oldest first
  private readonly max: number;
  private readonly staleMs: number;
  private readonly now: () => number;

  constructor(opts: InstantCacheOptions = {}) {
    this.max = Math.max(1, opts.max ?? DEFAULT_MAX);
    this.staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.map.size;
  }

  /** Keys, least recently used first. */
  keys(): string[] {
    return [...this.map.keys()];
  }

  /** Read and mark as most recently used. `staleMs` overrides the cache default for this read. */
  get(key: string, staleMs: number = this.staleMs): CacheHit<T> | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    this.map.delete(key);
    this.map.set(key, entry);
    return { ...entry, fresh: this.now() - entry.at < staleMs };
  }

  /** Read without touching LRU order. */
  peek(key: string): CacheEntry<T> | undefined {
    return this.map.get(key);
  }

  set(key: string, data: T): void {
    this.map.delete(key);
    this.map.set(key, { data, at: this.now() });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  /** Drop every key starting with `prefix`, or everything when omitted. Returns how many went. */
  invalidate(prefix?: string): number {
    if (prefix === undefined || prefix === "") {
      const n = this.map.size;
      this.map.clear();
      return n;
    }
    let n = 0;
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
        n++;
      }
    }
    return n;
  }
}

// One cache per endpoint, created on first use in the browser. Never populated on the server.
const registry = new Map<string, InstantCache<unknown>>();

/** The cache for an endpoint (browser). On the server a throwaway instance is returned and not retained. */
export function getCache<T>(endpoint: string, opts?: InstantCacheOptions): InstantCache<T> {
  if (typeof window === "undefined") return new InstantCache<T>(opts);
  let c = registry.get(endpoint);
  if (!c) {
    c = new InstantCache<unknown>(opts);
    registry.set(endpoint, c);
  }
  return c as InstantCache<T>;
}

/** The cache for an endpoint only if one exists. */
export function peekCache<T>(endpoint: string): InstantCache<T> | undefined {
  return registry.get(endpoint) as InstantCache<T> | undefined;
}

/** Forget an endpoint's cache entirely (hook unmount). */
export function dropCache(endpoint: string): void {
  registry.delete(endpoint);
}

/** Window event fired by `invalidateQueries`; mounted hooks listen and refetch what is on screen. */
export const INVALIDATE_EVENT = "findtern:instant-invalidate";
export interface InvalidateDetail {
  endpoint?: string;
  prefix?: string;
}

/**
 * Invalidate from anywhere (a star toggle, a mutation handler) without holding the hook.
 * Drops cached entries, then mounted `useInstantQuery` hooks for that endpoint refetch the current query.
 * `endpoint` omitted = every endpoint.
 */
export function invalidateQueries(endpoint?: string, prefix?: string): void {
  if (endpoint === undefined) {
    for (const c of registry.values()) c.invalidate(prefix);
  } else {
    registry.get(endpoint)?.invalidate(prefix);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<InvalidateDetail>(INVALIDATE_EVENT, { detail: { endpoint, prefix } }));
  }
}
