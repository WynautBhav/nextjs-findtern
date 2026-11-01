"use client";

import { useEffect } from "react";

/**
 * A fixed or sticky bar floats over the content, and Chrome does not apply
 * `scroll-padding` to an element already on screen, so a control tabbed to
 * near the fold lands under the bar (WCAG 2.4.11). Lift it clear.
 */
export function KeepFocusClear({ of }: { of: string }) {
  useEffect(() => {
    function onFocus(e: FocusEvent) {
      const bar = document.getElementById(of);
      const t = e.target;
      if (!bar || !(t instanceof HTMLElement) || bar.contains(t) || !t.matches(":focus-visible")) return;
      const covered = () => {
        const r = t.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        if (!(r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right)) return 0;
        // On screen, trust hit-testing: a fixed header above the bar is not covered by it.
        const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
        if (y >= 0 && y < innerHeight && !bar.contains(document.elementFromPoint(x, y))) return 0;
        return r.bottom - b.top + 16;
      };
      if (!covered()) return;
      // Instant: a smooth scroll here would cancel the browser's own focus scroll half-way.
      t.scrollIntoView({ block: "center", behavior: "instant" });
      // A sticky bar can't rise above its container's top, so centring may not be enough.
      const left = covered();
      if (left) window.scrollBy({ top: left, behavior: "instant" });
    }
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [of]);
  return null;
}
