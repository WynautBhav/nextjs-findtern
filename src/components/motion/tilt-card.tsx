"use client";

import { useEffect, useRef } from "react";

import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * Mouse-tracked 3D tilt.
 *
 * The legacy `.tilt-3d` class was applied to more than twenty cards across six
 * pages and its entire CSS body was `transform: none; transition: none` — it
 * did nothing at all. This is the version that works: the card rotates toward
 * the cursor with a spring, and a specular highlight tracks the pointer.
 *
 * Pointer-only. A tilt driven by device orientation on a phone would rotate
 * cards while someone is trying to read them, and by gyroscope on a tablet
 * that is flat on a desk would lock it at a random angle.
 */
export function TiltCard({
  children,
  className,
  max = 6,
  scale = 1.015,
  glare = true,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Maximum rotation in degrees on each axis. */
  max?: number;
  scale?: number;
  glare?: boolean;
  as?: "div" | "article" | "li";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches || prefersReducedMotion()) return;

    const rotX = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3.out" });
    const rotY = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3.out" });
    const sc = gsap.quickTo(el, "scale", { duration: 0.5, ease: "power3.out" });

    let raf = 0;
    let glareEl: HTMLElement | null = null;

    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;

        rotY((px - 0.5) * max * 2);
        rotX(-(py - 0.5) * max * 2);
        sc(scale);

        if (glare && glareEl) {
          glareEl.style.opacity = "1";
          glareEl.style.background = `radial-gradient(420px circle at ${px * 100}% ${
            py * 100
          }%, rgb(255 255 255 / 0.22), transparent 62%)`;
        }
      });
    };

    const onLeave = () => {
      rotX(0);
      rotY(0);
      sc(1);
      if (glareEl) glareEl.style.opacity = "0";
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    if (glare) {
      glareEl = document.createElement("span");
      glareEl.setAttribute("aria-hidden", "true");
      glareEl.className =
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300";
      el.appendChild(glareEl);
    }

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      glareEl?.remove();
    };
  }, [max, scale, glare]);

  return (
    <Tag
      ref={ref as never}
      className={cn(
        "relative [transform-style:preserve-3d] [perspective:1000px]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
