/**
 * A fill that grows from a fixed edge: a bar, a waterfall step, a meter.
 * Pure CSS (`.admin-reveal` in globals.css), so it is server-safe and the
 * element is in the server HTML at its final size; the keyframe only names the
 * starting scale and the animation uses a `backwards` fill, so nothing is
 * hidden without script. Put the final scale on the element yourself
 * (`style={{ transform: "scaleX(0.62)" }}`); the animation ends there.
 *
 * Transform only, never width. The delay steps 40ms per `index`, capped at 8
 * steps. Reduced motion: no travel, a 120ms opacity fade, final state at once.
 */

import type { CSSProperties, ElementType, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const REVEAL_MAX_STEPS = 8;

export function Reveal({
  as: As = "div",
  axis = "x",
  index = 0,
  className,
  style,
  ...rest
}: {
  as?: ElementType;
  /** `x` grows from the left edge, `y` from the bottom edge. */
  axis?: "x" | "y";
  /** Position in the sequence; sets the stagger (40ms a step, 8 steps at most). */
  index?: number;
} & HTMLAttributes<HTMLElement>) {
  const step = Number.isFinite(index) ? Math.min(Math.max(Math.trunc(index), 0), REVEAL_MAX_STEPS) : 0;
  return (
    <As
      data-axis={axis}
      className={cn("admin-reveal", className)}
      style={{ "--i": step, ...style } as CSSProperties}
      {...rest}
    />
  );
}
