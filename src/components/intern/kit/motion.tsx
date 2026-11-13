"use client";

import { Children, isValidElement } from "react";
import { motion, MotionConfig } from "motion/react";

import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Staggered entrance for a page's blocks: each direct child rises 12px and
 * fades in, 60ms apart. Transform + opacity only; reduced motion drops the travel.
 */
export function Stagger({ children, className, step = 0.06 }: { children: React.ReactNode; className?: string; step?: number }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <MotionConfig reducedMotion="user">
      <div className={className}>
        {items.map((child, i) => (
          <motion.div
            key={isValidElement(child) && child.key != null ? child.key : i}
            className="min-w-0"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 3) * step }}
          >
            {child}
          </motion.div>
        ))}
      </div>
    </MotionConfig>
  );
}

/** Spring hover/press lift for a card-sized link target. */
export function Lift({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={cn("min-w-0", className)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
