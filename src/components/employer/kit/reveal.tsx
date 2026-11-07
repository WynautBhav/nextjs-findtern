"use client";

import { motion, MotionConfig } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Staggered entrance for lists on the employer console. Transform and opacity
 * only; `reducedMotion="user"` drops the travel for people who ask for it.
 * Children are plain nodes; each is wrapped so keys stay with the caller.
 */
export function RevealList({
  children,
  as = "ul",
  className,
  step = 0.05,
  ...rest
}: {
  children: React.ReactNode;
  as?: "ul" | "ol" | "div";
  className?: string;
  step?: number;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const Tag = motion[as] as typeof motion.ul;
  return (
    <MotionConfig reducedMotion="user">
      <Tag
        className={className}
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: step } } }}
        {...(rest as object)}
      >
        {children}
      </Tag>
    </MotionConfig>
  );
}

export function RevealItem({
  children,
  as = "li",
  className,
}: {
  children: React.ReactNode;
  as?: "li" | "div" | "section";
  className?: string;
}) {
  const Tag = motion[as] as typeof motion.li;
  return (
    <Tag
      className={cn(className)}
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </Tag>
  );
}
