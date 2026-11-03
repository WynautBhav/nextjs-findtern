"use client";

/**
 * Shared-layout moves for cards that change column or order (the proposal
 * board, the facet filters). Wrap a region in `FlipGroup`, make each movable
 * thing a `FlipItem` with a stable `layoutId`; motion animates the
 * transform between the old and new boxes (transform only, 180ms).
 * `MotionConfig reducedMotion="user"` in AdminShell turns the travel off.
 */

import { LayoutGroup, motion, type HTMLMotionProps } from "motion/react";

export const FlipGroup = LayoutGroup;

export function FlipItem({ layoutId, ...rest }: { layoutId: string } & HTMLMotionProps<"div">) {
  return <motion.div layout layoutId={layoutId} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }} {...rest} />;
}
