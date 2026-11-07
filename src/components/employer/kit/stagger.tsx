"use client";

import { motion, MotionConfig } from "motion/react";

/** Staggered entrance for a list; transform and opacity only, no travel under reduced motion. */
export function StaggerList({ children, className }: { children: React.ReactNode[]; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.ul className={className} initial="h" animate="v" transition={{ staggerChildren: 0.05 }}>
        {children.map((c, i) => (
          <motion.li
            key={i}
            variants={{ h: { opacity: 0, y: 8 }, v: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {c}
          </motion.li>
        ))}
      </motion.ul>
    </MotionConfig>
  );
}
