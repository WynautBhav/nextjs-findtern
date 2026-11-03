/**
 * Staggered arrival for rows and cards: opacity and a 8px rise, 30ms apart
 * (capped at 8 steps so a long list never waits). Pure CSS (`.admin-arrive`
 * in globals.css) so it renders in the server HTML and the content is never
 * hidden if script fails; the reduced-motion rule there turns it off.
 */

import type { CSSProperties, ElementType, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Arrive({
  as: As = "div",
  index = 0,
  className,
  style,
  ...rest
}: {
  as?: ElementType;
  /** Position in the list; sets the stagger. */
  index?: number;
} & HTMLAttributes<HTMLElement>) {
  return <As className={cn("admin-arrive", className)} style={{ "--i": index, ...style } as CSSProperties} {...rest} />;
}
