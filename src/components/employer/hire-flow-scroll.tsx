"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The hiring-steps list. Below `sm` it is one scrolling row (five steps do not
 * fit a phone, and a wrapped last step sat alone on a second line). It opens
 * with the current step in view, and the right edge fades while more steps lie
 * beyond it, so a cut-off step reads as "scroll", not as a glitch.
 */
export function FlowScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const measure = () => setMore(list.scrollLeft + list.clientWidth < list.scrollWidth - 2);
    const current = list.querySelector<HTMLElement>("[aria-current]");
    if (current && list.scrollWidth > list.clientWidth) list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    measure();
    // Keyboard focus must bring a step into view (it does not reliably inside this row).
    const reveal = (e: FocusEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (!el) return;
      const left = el.offsetLeft - 8;
      const right = el.offsetLeft + el.offsetWidth + 8;
      if (left < list.scrollLeft) list.scrollLeft = left;
      else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
    };
    list.addEventListener("focusin", reveal);
    list.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      list.removeEventListener("focusin", reveal);
      list.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <ol ref={ref} className={cn(className, more && "max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)]")}>
      {children}
    </ol>
  );
}
