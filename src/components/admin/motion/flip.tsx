"use client";

/**
 * Shared-layout moves for cards that change column or order (the proposal
 * board, the facet filters). Wrap a region in `FlipGroup`, make each movable
 * thing a `FlipItem` with a stable `layoutId`; motion animates the
 * transform between the old and new boxes (transform only, 180ms).
 *
 * `layout="position"` moves the box without stretching its children, so a
 * badge appearing or a title wrapping never distorts the card. Keep `layout`
 * to the visible cards: a list of 50 or more should not animate per item.
 *
 * Reduced motion: `MotionConfig reducedMotion="user"` in AdminShell drops the
 * travel, and a card that mounts in its new place fades in over 120ms instead.
 */

import { LayoutGroup, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { ADMIN_DUR, ADMIN_EASE, seconds } from "./constants";

export const FlipGroup = LayoutGroup;

export function FlipItem({ layoutId, ...rest }: { layoutId: string } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout="position"
      layoutId={layoutId}
      // Only set once the browser is known to prefer reduced motion, so the server HTML is never hidden.
      initial={reduce ? { opacity: 0 } : undefined}
      animate={reduce ? { opacity: 1 } : undefined}
      transition={{ duration: seconds(reduce ? ADMIN_DUR.fast : ADMIN_DUR.base), ease: ADMIN_EASE }}
      {...rest}
    />
  );
}
