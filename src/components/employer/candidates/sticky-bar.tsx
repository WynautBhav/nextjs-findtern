"use client";

/**
 * The slim bar that takes over the search, count, sort and view once the toolbar card scrolls out (lg and up).
 * It is a zero-height sticky strip, so it never moves the page; the bar inside only shows (and is only focusable)
 * while it is needed. While it shows, scroll-padding keeps a focused control from landing under it (WCAG 2.4.11).
 * Nothing slides under reduced motion.
 */

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Below the console header (4rem). */
const HEADER_PX = 64;

export function StickyBar({ targetId, label, children }: { targetId: string; label: string; children: React.ReactNode }) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const box = entry.boundingClientRect;
        // Gone off the top (not below the fold), and drawn at all: the card has no box below lg.
        setStuck(!entry.isIntersecting && box.height > 0 && box.bottom < HEADER_PX + 16);
      },
      { rootMargin: `-${HEADER_PX}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  useEffect(() => {
    const root = document.documentElement;
    if (stuck) root.style.scrollPaddingTop = "8rem";
    return () => {
      root.style.scrollPaddingTop = "";
    };
  }, [stuck]);

  return (
    <div className="pointer-events-none sticky top-16 z-20 h-0 max-lg:hidden">
      <div
        role="region"
        aria-label={label}
        inert={!stuck}
        aria-hidden={!stuck}
        className={cn(
          "absolute inset-x-0 top-0 rounded-b-apple-xl border border-t-0 border-ink-200/80 bg-white/98 px-3 py-2 shadow-md backdrop-blur-md transition-[opacity,transform] duration-150 motion-reduce:transition-none",
          stuck ? "pointer-events-auto visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}
