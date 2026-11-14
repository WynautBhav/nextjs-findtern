"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * A thin bar along the top of the viewport while a client-side navigation
 * is in flight (QA-151). The root `loading.tsx` used to cover this with a
 * spinner, but it also fixed every not-found page's status at 200 (QA-150),
 * so it is gone and the consoles keep their own loading skeletons. Outside
 * them, a slow connection otherwise shows nothing between the click and the
 * next page.
 *
 * Starts on a click on an internal link that will navigate in this tab, on
 * back and forward, and on `router.push` / `router.replace` made through
 * `useProgressRouter` (filters, sort menus, forms that navigate when they
 * finish). It waits SHOW_AFTER_MS before it appears, so a navigation that
 * lands at once (a prefetched page) never flashes it, ends when the URL
 * changes, and gives up after a while in case the navigation was cancelled.
 * Reduced motion gets a still bar, no sweep.
 */
const SHOW_AFTER_MS = 100;
const GIVE_UP_MS = 15_000;
const START_EVENT = "findtern:navigation-start";

/** Tells the bar a navigation to `href` is starting. Does nothing when `href` is the page already showing. */
export function startNavigationProgress(href: string | URL) {
  if (typeof window === "undefined") return;
  let url: URL;
  try {
    url = new URL(String(href), window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;
  window.dispatchEvent(new Event(START_EVENT));
}

/**
 * `useRouter`, except `push` and `replace` also start the top bar. A drop-in:
 * `const router = useProgressRouter();` and the rest of the file is unchanged.
 */
export function useProgressRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push(href: string, options?: Parameters<typeof router.push>[1]) {
        startNavigationProgress(href);
        router.push(href, options);
      },
      replace(href: string, options?: Parameters<typeof router.replace>[1]) {
        startNavigationProgress(href);
        router.replace(href, options);
      },
    }),
    [router],
  );
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const here = qs ? `${pathname}?${qs}` : pathname;
  // The URL the bar started on, and whether its delay has passed. Pending means
  // we are still on that URL: the moment the URL changes the bar is gone, with
  // no effect needed.
  const [nav, setNav] = useState<{ from: string; shown: boolean } | null>(null);
  const hereRef = useRef(here);
  useEffect(() => {
    hereRef.current = here;
  }, [here]);
  const pending = nav !== null && nav.from === here;

  const begin = useCallback(() => {
    // A second click while the first is still pending keeps the bar and its clock.
    setNav((n) => (n && n.from === hereRef.current ? n : { from: hereRef.current, shown: false }));
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      begin();
    }
    document.addEventListener("click", onClick, true);
    // Back and forward to a page the router has not kept: the same wait as a
    // click. A move between hashes on this page changes no route, so no bar.
    function onPopState() {
      const search = new URLSearchParams(window.location.search).toString();
      if ((search ? `${window.location.pathname}?${search}` : window.location.pathname) === hereRef.current) return;
      begin();
    }
    window.addEventListener("popstate", onPopState);
    window.addEventListener(START_EVENT, begin);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener(START_EVENT, begin);
    };
  }, [begin]);

  // Show the bar only if the navigation is still going after SHOW_AFTER_MS; a
  // navigation that never lands (cancelled, or back on the same URL after a
  // redirect) must not leave it up.
  const started = pending ? nav.from : null;
  useEffect(() => {
    if (started === null) return;
    const show = window.setTimeout(() => setNav((n) => (n && n.from === started && !n.shown ? { ...n, shown: true } : n)), SHOW_AFTER_MS);
    const giveUp = window.setTimeout(() => setNav(null), GIVE_UP_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(giveUp);
    };
  }, [started]);

  if (!pending || !nav.shown) return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading the next page"
      aria-busy="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-brand-700/15"
    >
      <div className="h-full w-full origin-left bg-brand-700 motion-safe:animate-nav-progress motion-reduce:w-2/3" />
    </div>
  );
}
