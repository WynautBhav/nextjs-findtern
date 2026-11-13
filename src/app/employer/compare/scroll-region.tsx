"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The comparison table's own scroll container. It shows a right-edge fade and a
 * one-line hint while there is more to the right, so sideways scrolling stays
 * inside the table at 390 px and is visible as a gesture.
 */
export function ScrollRegion({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div>
      {more ? (
        <p className="mb-2 text-xs text-text-subtle" aria-hidden>
          Scroll sideways to see every candidate.
        </p>
      ) : null}
      <div className="relative">
        <div
          ref={ref}
          onScroll={measure}
          tabIndex={0}
          role="region"
          aria-label={label}
          className={cn("overflow-auto overscroll-x-contain", className)}
        >
          {children}
        </div>
        {more ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-2xl bg-gradient-to-l from-white via-white/70 to-transparent"
          />
        ) : null}
      </div>
    </div>
  );
}
