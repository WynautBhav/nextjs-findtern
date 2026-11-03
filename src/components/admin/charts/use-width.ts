"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measured width of an element, so a chart can draw its viewBox in real
 * pixels (text stays readable at 390px) instead of scaling a fixed canvas.
 * Starts at `initial` so server and first client render agree.
 */
export function useWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
