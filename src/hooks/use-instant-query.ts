"use client";

/**
 * useInstantQuery: filters, sort, paging and tabs that update in place.
 *
 * The server renders the first paint; after that each query change is one GET to a results
 * endpoint. The old results stay on screen while the new ones load (never blank), identical
 * queries are served from an in-memory LRU, the URL is kept in sync so links are shareable and
 * Back/Forward restore from the cache in the same frame.
 *
 *   const q = useInstantQuery<Results>({
 *     endpoint: "/api/employer/candidates/results",
 *     initial: { qs: searchParams.toString(), data: serverResults }, // seeds state and cache
 *     debounceMs: 250,                                              // for { debounce: true }
 *     prefetch: (qs, data) => [withPage(qs, data.page + 1)],        // optional idle warm-up
 *   });
 *   q.set(withFilters(q.qs, { sort: "new" }));                       // push + fetch (or cache hit)
 *   q.set(nextQs, { history: "replace", debounce: true });           // typing: coalesced, replaceState
 *   <ResultsRegion pending={q.pending} error={q.error} onRetry={q.refetch} count={q.data.total}>
 *     <List rows={q.data.candidates} />
 *   </ResultsRegion>
 *   // after a mutation: q.invalidate()  (or invalidateQueries(endpoint) from another component)
 *   // hover/focus a link: onPointerEnter={() => prefetch(endpoint, href)}
 *
 * Notes: GET only (no CSRF header needed; mutations keep using csrfFetch). A 401/403 hard-navigates
 * to sign-in. A 403 the app already handles in place (terms gate, disabled account) is announced to
 * those listeners and shown as an error instead. Failures never replace good data and are never cached.
 * The cache is scoped to the endpoint and dropped on unmount. With `debounce`, the URL and request
 * both update after the quiet period (the input itself stays controlled by the caller).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { announceAccountDisabled, announceTermsRequired } from "@/lib/client-fetch";
import {
  type InvalidateDetail,
  INVALIDATE_EVENT,
  dropCache,
  getCache,
  normaliseQuery,
  queryOf,
} from "@/lib/instant-query/cache";
import {
  type FetchResult,
  type InstantController,
  type SetOptions,
  type Snapshot,
  buildUrl,
  createInstantController,
  initialSnapshot,
  isHandledInPlace403,
} from "@/lib/instant-query/instant-query-core";

export type { InstantError, SetOptions } from "@/lib/instant-query/instant-query-core";
export { invalidateQueries } from "@/lib/instant-query/cache";

export interface UseInstantQueryOptions<T> {
  /** Results endpoint, e.g. `/api/employer/candidates/results`. Called as `GET <endpoint>?<qs>`. */
  endpoint: string;
  /** What the server rendered. Changing it (new server render) is adopted and re-seeds the cache. */
  initial: { qs: string; data: T };
  /** Quiet period for `set(..., { debounce: true })`. Default 250. */
  debounceMs?: number;
  /** Age after which a cached result is shown but revalidated. Default 30 000. */
  staleMs?: number;
  /** LRU capacity. Default 30. */
  max?: number;
  /** Where to send a 401/403. Default: the sign-in page for the endpoint's role. */
  loginUrl?: string;
  /** Queries worth warming once the current one settles (idle time). */
  prefetch?: (qs: string, data: T) => string[];
}

export interface UseInstantQuery<T> {
  data: T;
  /** The requested query (matches the URL). */
  qs: string;
  /** A request for `qs` is in flight while older data is shown. */
  pending: boolean;
  /** Showing a cached copy older than `staleMs` that is being revalidated (or failed to). */
  stale: boolean;
  error: { message: string; status?: number; offline: boolean } | null;
  set: (qs: string, opts?: SetOptions) => void;
  /** Re-request the current query (the Retry button). */
  refetch: () => void;
  /** Drop cached results (all, or keys starting with `prefix`) and refetch the current query. */
  invalidate: (prefix?: string) => void;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, { signal, credentials: "same-origin", headers: { accept: "application/json" }, cache: "no-store" });
    if (res.status === 401) return { kind: "auth", status: 401 };
    if (res.status === 403) {
      const body = await res.json().catch(() => null);
      if (isHandledInPlace403(body)) {
        announceTermsRequired(body);
        announceAccountDisabled(body);
        return { kind: "error", status: 403, message: (body as { error?: string } | null)?.error };
      }
      return { kind: "auth", status: 403 };
    }
    if (!res.ok) return { kind: "error", status: res.status };
    return { kind: "ok", data: (await res.json()) as T };
  } catch (e) {
    if (signal.aborted || (e as { name?: string })?.name === "AbortError") return { kind: "aborted" };
    return { kind: "error" };
  }
}

const inflightPrefetch = new Map<string, Promise<void>>();

/**
 * Warm the cache for a link or query without showing it (hover / focus / idle). `hrefOrQuery` may be
 * `/employer/candidates?page=2`, `?page=2` or `page=2`. No-op when a fresh entry exists or on the
 * server. Errors and 401/403 are ignored.
 */
export function prefetch<T = unknown>(endpoint: string, hrefOrQuery: string, staleMs = 30_000): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const qs = queryOf(hrefOrQuery);
  const cache = getCache<T>(endpoint);
  if (cache.get(qs, staleMs)?.fresh) return Promise.resolve();
  const key = buildUrl(endpoint, qs);
  const running = inflightPrefetch.get(key);
  if (running) return running;
  const p = fetchJson<T>(key, new AbortController().signal)
    .then((res) => {
      if (res.kind === "ok") getCache<T>(endpoint).set(qs, res.data);
    })
    .finally(() => inflightPrefetch.delete(key));
  inflightPrefetch.set(key, p);
  return p;
}

const idle = (fn: () => void): (() => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(fn);
    return () => w.cancelIdleCallback!(id);
  }
  const id = window.setTimeout(fn, 200);
  return () => window.clearTimeout(id);
};

export function useInstantQuery<T>(opts: UseInstantQueryOptions<T>): UseInstantQuery<T> {
  const { endpoint, initial } = opts;
  const [snap, setSnap] = useState<Snapshot<T>>(() => initialSnapshot(initial));
  const ctrl = useRef<InstantController<T> | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    const o = optsRef.current;
    const cache = getCache<T>(endpoint, { max: o.max, staleMs: o.staleMs });
    const c = createInstantController<T>(
      {
        endpoint,
        cache,
        // Read through the ref so a changed option applies without rebuilding the controller.
        get staleMs() {
          return optsRef.current.staleMs ?? 30_000;
        },
        get debounceMs() {
          return optsRef.current.debounceMs ?? 250;
        },
        get loginUrl() {
          return optsRef.current.loginUrl;
        },
        fetcher: fetchJson<T>,
        writeHistory: (mode, qs) => {
          const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
          if (mode === "push") window.history.pushState(null, "", url);
          else window.history.replaceState(null, "", url);
        },
        redirect: (to) => window.location.assign(to),
        isOnline: () => navigator.onLine,
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (id) => window.clearTimeout(id as number),
        onChange: setSnap,
      },
      optsRef.current.initial,
    );
    ctrl.current = c;
    cache.set(normaliseQuery(o.initial.qs), o.initial.data);

    const onPop = () => c.popstate(window.location.search);
    const onInvalidate = (e: Event) => {
      const d = (e as CustomEvent<InvalidateDetail>).detail;
      if (d?.endpoint !== undefined && d.endpoint !== endpoint) return;
      // The cache was already cleared by invalidateQueries; refetch what is on screen.
      if (d?.prefix === undefined || c.snapshot.qs.startsWith(d.prefix)) c.refetch();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener(INVALIDATE_EVENT, onInvalidate);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener(INVALIDATE_EVENT, onInvalidate);
      c.dispose();
      ctrl.current = null;
      dropCache(endpoint);
    };
  }, [endpoint]);

  // A new server render (router.refresh, project change) is the truth: adopt it.
  useEffect(() => {
    ctrl.current?.adopt(initial);
  }, [initial.qs, initial.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Idle warm-up of the neighbours of the query that just settled.
  const { qs, data, dataQs, pending } = snap;
  useEffect(() => {
    const warm = optsRef.current.prefetch;
    if (!warm || pending || qs !== dataQs) return;
    return idle(() => {
      for (const next of warm(qs, data).slice(0, 4)) void ctrl.current?.prefetch(next);
    });
  }, [qs, data, dataQs, pending]);

  const set = useCallback((next: string, o?: SetOptions) => ctrl.current?.set(next, o), []);
  const refetch = useCallback(() => ctrl.current?.refetch(), []);
  const invalidate = useCallback((prefix?: string) => ctrl.current?.invalidate(prefix), []);

  return { data: snap.data, qs: snap.qs, pending: snap.pending, stale: snap.stale, error: snap.error, set, refetch, invalidate };
}
