"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * Magnetic hover.
 *
 * The element drifts toward the cursor while it is nearby and springs back on
 * exit. The strength is deliberately small — a fraction of the remaining
 * distance. Anything stronger reads as a toy rather than as restraint, and it
 * makes the click target feel like it moved out from under the pointer.
 *
 * Desktop pointer only, and the inner label counter-moves at a fraction of the
 * same rate so the two layers separate slightly on hover. That parallax is the
 * detail that makes it read as depth rather than as a dragged div.
 *
 * ── Releasing ──────────────────────────────────────────────────────────
 *
 * The listener is on `window`, not the element, so the magnet has a radius
 * larger than its own bounds. That means `active` can be true when the pointer
 * is nowhere near the button — and the previous version only ever cleared
 * `active` from inside the pointermove handler itself.
 *
 * So the moment the pointer stopped generating pointermove events, `active`
 * stayed true, the rAF loop never exited, and the element held its last offset
 * forever. Reached by moving the mouse out of the browser window, onto the tab
 * strip, into devtools, onto a second monitor, or by starting a drag and
 * leaving. The button looked stuck and grabbable.
 *
 * Three independent releases now:
 *   - a stale-event check in the loop, which catches every case above without
 *     enumerating them;
 *   - `pointerleave` on the document, for the ordinary exit;
 *   - `blur` on the window, for alt-tab and focus loss.
 *
 * The rAF loop also self-terminates once the offset decays below a threshold,
 * so an inactive element costs nothing between interactions.
 */

/** No pointer event for this long means the pointer is gone, not idle. */
const STALE_MS = 120;
/** Below this the spring has visually arrived. */
const REST_EPSILON = 0.1;

export function Magnetic({
  children,
  className,
  strength = 0.22,
  radius = 60,
}: {
  children: ReactNode;
  className?: string;
  /**
   * 0–1. Fraction of the remaining distance the element travels.
   *
   * Kept low on purpose. The pull is strongest at the edge of the radius, so a
   * large strength on a wide element displaces it by `strength * (half width +
   * radius)` — with 0.35 and a 90px radius on a 108px button that is 35px,
   * far enough that the cursor can slip off the thing it was aiming at. A
   * click target should never move away from a pointer that is approaching it.
   */
  strength?: number;
  /** Pixels beyond the element bounds where the magnet is still active. */
  radius?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches || prefersReducedMotion()) return;

    const label = el.firstElementChild as HTMLElement | null;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let lx = 0;
    let ly = 0;
    let active = false;
    let lastEventAt = 0;

    const release = () => {
      active = false;
      lx = 0;
      ly = 0;
    };

    const settled = () =>
      !active && Math.abs(tx) < REST_EPSILON && Math.abs(ty) < REST_EPSILON;

    const apply = () => {
      // The safety net. If the pointer has not moved for longer than a frame or
      // two, it is not "resting nearby" — it has left, and we are chasing a
      // position that no longer exists.
      if (active && performance.now() - lastEventAt > STALE_MS) release();

      tx += (lx - tx) * 0.18;
      ty += (ly - ty) * 0.18;

      el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
      if (label) {
        label.style.transform = `translate3d(${(tx * -0.28).toFixed(2)}px, ${(
          ty * -0.28
        ).toFixed(2)}px, 0)`;
      }

      if (settled()) {
        // Fully arrived: drop the transform and stop animating entirely, so an
        // idle header costs no frames and no compositing layer.
        el.style.transform = "";
        el.style.willChange = "auto";
        if (label) {
          label.style.transform = "";
          label.style.willChange = "auto";
        }
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(apply);
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onMove = (e: PointerEvent) => {
      lastEventAt = performance.now();

      // getBoundingClientRect reports the *transformed* box, so the centre
      // moves with the element and the hit zone drifts along with it. Subtract
      // the offset we are currently applying to recover the layout box.
      const r = el.getBoundingClientRect();
      const bx = r.left - tx;
      const by = r.top - ty;
      const cx = bx + r.width / 2;
      const cy = by + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      const inside =
        dx > -r.width / 2 - radius &&
        dx < r.width / 2 + radius &&
        dy > -r.height / 2 - radius &&
        dy < r.height / 2 + radius;

      if (!inside) {
        release();
        kick();
        return;
      }

      active = true;
      el.style.willChange = "transform";
      if (label) label.style.willChange = "transform";
      lx = dx * strength;
      ly = dy * strength;
      kick();
    };

    const onLeave = () => {
      release();
      kick();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      el.style.transform = "";
      if (label) label.style.transform = "";
    };
  }, [strength, radius]);

  return (
    <span ref={ref} className={cn("inline-flex", className)}>
      <span className="inline-flex">{children}</span>
    </span>
  );
}
