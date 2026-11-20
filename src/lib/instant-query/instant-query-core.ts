/**
 * The state machine behind `useInstantQuery`, with no React, DOM or global fetch:
 * everything it touches arrives through `ControllerDeps`, so the abort, cache-hit, error and
 * popstate paths are unit-tested in node (instant-query-core.test.ts).
 *
 * Rules (the hook is a thin shell over these):
 *   - `data` is never cleared. A new query keeps the previous data on screen while it loads.
 *   - Only the newest request may land: starting one aborts the previous; a response whose
 *     query is no longer the current one is dropped.
 *   - Cache hit (fresh): shown at once, no request. Stale hit: shown at once, then revalidated
 *     in the background (state.stale stays true until it settles).
 *   - A failed request keeps the last good data and sets `error`; failures are never cached.
 *   - A 401/403 asks the shell to hard-navigate to sign-in (`redirect`), except 403 bodies the app
 *     already handles in place (terms gate, disabled account) which surface as an error.
 *   - After `dispose()` nothing is emitted and nothing is fetched.
 */
import { type InstantCache, normaliseQuery } from "./cache.ts";

export type HistoryMode = "push" | "replace" | "none";

export interface InstantError {
  message: string;
  /** HTTP status when the server answered; undefined for network/abort-free failures. */
  status?: number;
  /** The browser reports no connection. */
  offline: boolean;
}

export interface Snapshot<T> {
  /** The query the user asked for (what the URL shows). */
  qs: string;
  /** The last good data. Belongs to `dataQs`, which differs from `qs` while a new query loads. */
  data: T;
  dataQs: string;
  /** A request for the current `qs` is in flight and the user is looking at other data (or a forced refetch). */
  pending: boolean;
  /** `data` came from a cache entry older than `staleMs` and is being revalidated, or revalidation failed. */
  stale: boolean;
  error: InstantError | null;
}

export type FetchResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "auth"; status: 401 | 403 }
  | { kind: "error"; status?: number; message?: string }
  | { kind: "aborted" };

export interface ControllerDeps<T> {
  endpoint: string;
  cache: InstantCache<T>;
  staleMs: number;
  debounceMs: number;
  /** Performs the GET. Must resolve `{ kind: "aborted" }` (or reject) when `signal` aborts. */
  fetcher: (url: string, signal: AbortSignal) => Promise<FetchResult<T>>;
  /** Write the URL (`pushState`/`replaceState`) for a query. */
  writeHistory: (mode: "push" | "replace", qs: string) => void;
  /** Hard navigation to sign-in. */
  redirect: (to: string) => void;
  loginUrl?: string;
  isOnline: () => boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
  /** Called with every new snapshot; never after dispose. */
  onChange: (s: Snapshot<T>) => void;
}

export interface SetOptions {
  history?: HistoryMode;
  /** Wait `debounceMs` of quiet before applying (typing inputs). Later calls replace earlier ones. */
  debounce?: boolean;
}

export function buildUrl(endpoint: string, qs: string): string {
  return qs ? `${endpoint}?${qs}` : endpoint;
}

/** Where a 401/403 from this endpoint should land, matching the app's other sign-in redirects. */
export function loginPathForEndpoint(endpoint: string): string {
  if (endpoint.startsWith("/api/admin")) return "/admin/login";
  if (endpoint.startsWith("/api/employer")) return "/login?as=employer";
  return "/login?as=intern";
}

/** 403 bodies the app handles in place (client-fetch.ts): they are not a reason to leave the page. */
export function isHandledInPlace403(body: unknown): boolean {
  const code = (body as { code?: unknown } | null)?.code;
  return code === "terms_required" || code === "ACCOUNT_DISABLED";
}

export function errorFor(result: { status?: number; message?: string }, online: boolean): InstantError {
  if (!online) return { message: "You're offline; showing the last results", status: result.status, offline: true };
  return { message: result.message ?? "Couldn't update results", status: result.status, offline: false };
}

export function initialSnapshot<T>(initial: { qs: string; data: T }): Snapshot<T> {
  const qs = normaliseQuery(initial.qs);
  return { qs, data: initial.data, dataQs: qs, pending: false, stale: false, error: null };
}

export interface InstantController<T> {
  readonly snapshot: Snapshot<T>;
  /** Move to a query: URL now (or after the debounce), cache hit instantly, otherwise fetch. */
  set(qs: string, opts?: SetOptions): void;
  /** Back/Forward: the URL already changed; follow it without touching history. */
  popstate(qs: string): void;
  /** Re-request the current query (retry button, after a mutation). Keeps data on screen. */
  refetch(): void;
  /** Drop cache entries (all, or keys starting with `prefix`) and refetch the current query if it was dropped. */
  invalidate(prefix?: string): void;
  /** Server rendered new data (e.g. after router.refresh or a full navigation): adopt it and seed the cache. */
  adopt(initial: { qs: string; data: T }): void;
  /** Warm the cache for a query without showing it. Resolves when settled; never throws. */
  prefetch(qs: string): Promise<void>;
  dispose(): void;
}

export function createInstantController<T>(deps: ControllerDeps<T>, initial: { qs: string; data: T }): InstantController<T> {
  let snap = initialSnapshot(initial);
  let disposed = false;
  let abort: AbortController | null = null;
  let seq = 0; // id of the newest request; older ones are dropped
  let debounceTimer: unknown = null;
  const inflightPrefetch = new Map<string, Promise<void>>();

  const online = () => deps.isOnline();

  function emit(patch: Partial<Snapshot<T>>) {
    if (disposed) return;
    snap = { ...snap, ...patch };
    deps.onChange(snap);
  }

  function cancelRequest() {
    abort?.abort();
    abort = null;
    seq++;
  }

  function clearDebounce() {
    if (debounceTimer !== null) {
      deps.clearTimer(debounceTimer);
      debounceTimer = null;
    }
  }

  /** `quiet`: background revalidation of data already on screen (no pending flag, errors keep `stale`). */
  function request(qs: string, quiet: boolean) {
    cancelRequest();
    const mine = seq;
    const ctrl = new AbortController();
    abort = ctrl;
    if (!quiet) emit({ pending: true, error: null });
    deps.fetcher(buildUrl(deps.endpoint, qs), ctrl.signal).then(
      (res) => settle(mine, qs, quiet, res),
      () => settle(mine, qs, quiet, { kind: "error" }),
    );
  }

  function settle(mine: number, qs: string, quiet: boolean, res: FetchResult<T>) {
    if (disposed || mine !== seq || qs !== snap.qs) return; // superseded: drop the late result
    abort = null;
    switch (res.kind) {
      case "aborted":
        return;
      case "ok":
        deps.cache.set(qs, res.data);
        emit({ data: res.data, dataQs: qs, pending: false, stale: false, error: null });
        return;
      case "auth":
        deps.redirect(deps.loginUrl ?? loginPathForEndpoint(deps.endpoint));
        emit({ pending: false });
        return;
      case "error":
        if (quiet) emit({ pending: false, stale: true }); // the stale copy stays; no banner for a silent revalidation
        else emit({ pending: false, error: errorFor(res, online()) });
        return;
    }
  }

  /** Show cached data for `qs` if any. Returns whether it was a hit. */
  function applyQuery(qs: string, force: boolean) {
    const hit = force ? undefined : deps.cache.get(qs, deps.staleMs);
    if (hit?.fresh) {
      cancelRequest();
      emit({ qs, data: hit.data, dataQs: qs, pending: false, stale: false, error: null });
      return;
    }
    if (hit) {
      emit({ qs, data: hit.data, dataQs: qs, pending: false, stale: true, error: null });
      request(qs, true);
      return;
    }
    emit({ qs, pending: true, error: null });
    request(qs, false);
  }

  function go(qsIn: string, history: HistoryMode) {
    const qs = normaliseQuery(qsIn);
    clearDebounce();
    if (history !== "none") deps.writeHistory(history, qs);
    if (qs === snap.qs && !snap.error) {
      // Same query: nothing to load unless the data on screen is stale/pending already handled.
      return;
    }
    applyQuery(qs, false);
  }

  return {
    get snapshot() {
      return snap;
    },
    set(qs, opts = {}) {
      if (disposed) return;
      const history = opts.history ?? "push";
      if (opts.debounce && deps.debounceMs > 0) {
        clearDebounce();
        debounceTimer = deps.setTimer(() => {
          debounceTimer = null;
          go(qs, history);
        }, deps.debounceMs);
        return;
      }
      go(qs, history);
    },
    popstate(qs) {
      if (disposed) return;
      go(qs, "none");
    },
    refetch() {
      if (disposed) return;
      clearDebounce();
      deps.cache.delete(snap.qs);
      applyQuery(snap.qs, true);
    },
    invalidate(prefix) {
      if (disposed) return;
      deps.cache.invalidate(prefix);
      if (prefix === undefined || prefix === "" || snap.qs.startsWith(prefix)) {
        clearDebounce();
        applyQuery(snap.qs, true);
      }
    },
    adopt(next) {
      if (disposed) return;
      const qs = normaliseQuery(next.qs);
      if (next.data === snap.data && qs === snap.qs) return;
      cancelRequest();
      clearDebounce();
      deps.cache.set(qs, next.data);
      emit({ qs, data: next.data, dataQs: qs, pending: false, stale: false, error: null });
    },
    prefetch(qsIn) {
      const qs = normaliseQuery(qsIn);
      if (disposed || deps.cache.get(qs, deps.staleMs)?.fresh) return Promise.resolve();
      const running = inflightPrefetch.get(qs);
      if (running) return running;
      const p = deps
        .fetcher(buildUrl(deps.endpoint, qs), new AbortController().signal)
        .then((res) => {
          if (!disposed && res.kind === "ok") deps.cache.set(qs, res.data);
        })
        .catch(() => {})
        .finally(() => inflightPrefetch.delete(qs));
      inflightPrefetch.set(qs, p);
      return p;
    },
    dispose() {
      disposed = true;
      cancelRequest();
      clearDebounce();
    },
  };
}
