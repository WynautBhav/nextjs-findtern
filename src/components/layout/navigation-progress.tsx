"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar along the top of the viewport while a client-side navigation
 * is in flight (QA-151). The root `loading.tsx` used to cover this with a
 * spinner, but it also fixed every not-found page's status at 200 (QA-150),
 * so it is gone and the consoles keep their own loading skeletons. Outside
 * them, a slow connection otherwise shows nothing between the click and the
 * next page.
 *
 * Starts on a click on an internal link that will navigate in this tab,
 * ends when the URL changes, and gives up after a while in case the
 * navigation was cancelled. Reduced motion gets a still bar, no sweep.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const here = qs ? `${pathname}?${qs}` : pathname;
  // The URL the bar started on. Pending means we are still on it: the moment
  // the URL changes the bar is gone, with no effect needed.
  const [startedOn, setStartedOn] = useState<string | null>(null);
  const hereRef = useRef(here);
  useEffect(() => {
    hereRef.current = here;
  }, [here]);
  const pending = startedOn !== null && startedOn === here;

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
      setStartedOn(hereRef.current);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // A navigation that never lands (cancelled, or back on the same URL after
  // a redirect) must not leave the bar up.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setStartedOn(null), 15_000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (!pending) return null;
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
