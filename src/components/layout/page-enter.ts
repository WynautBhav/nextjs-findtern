"use client";

import { useEffect, useRef } from "react";

import { START_EVENT } from "@/components/layout/navigation-progress";

/**
 * One soft arrival per real navigation, and nothing for a same-page URL update.
 *
 * The shells used to key the page on the pathname, which re-mounted the page (and dropped its state)
 * whenever code called `history.replaceState` to put an id in the address bar. Now the page is never
 * re-mounted by the shell: when the pathname changes and a navigation was started in the last few
 * seconds (a link click, back/forward, `useProgressRouter`: see `START_EVENT`), the wrapper plays a
 * Web Animations API fade/rise. A `replaceState` made by app code starts no navigation, so it animates
 * nothing and keeps every bit of state. Reduced motion: no animation.
 */
export function usePageEnter(pathname: string) {
  const ref = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);
  const last = useRef(pathname);

  useEffect(() => {
    const mark = () => {
      startedAt.current = Date.now();
    };
    window.addEventListener(START_EVENT, mark);
    window.addEventListener("popstate", mark);
    return () => {
      window.removeEventListener(START_EVENT, mark);
      window.removeEventListener("popstate", mark);
    };
  }, []);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    const navigated = Date.now() - startedAt.current < 10_000;
    startedAt.current = 0;
    if (!navigated || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    // Restart the CSS animation (`.page-enter`, 300ms) without re-mounting anything inside.
    el.classList.remove("page-enter");
    void el.offsetWidth;
    el.classList.add("page-enter");
  }, [pathname]);

  return ref;
}
