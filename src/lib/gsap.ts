/**
 * GSAP core — safe to import from both server and client components.
 *
 * Split from ./motion.ts because that file also defines React hooks, and a
 * module exporting `useState` cannot be pulled into a Server Component graph
 * even when the consumer only wants a constant.
 *
 * `gsap.registerPlugin` is guarded on `typeof window` so importing this from a
 * server component during SSR does not touch the DOM. ScrollTrigger
 * self-registers its listeners on first use in the browser.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.defaults({ markers: false });
}

/**
 * Easing vocabulary, mirroring --ease-out-expo and friends in globals.css so
 * GSAP tweens and CSS transitions decelerate identically.
 */
export const EASE = {
  outExpo: "expo.out",
  outQuart: "quart.out",
  inOutQuart: "power4.inOut",
  spring: "back.out(1.5)",
} as const;

/** True when the visitor has asked for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, ScrollTrigger };
