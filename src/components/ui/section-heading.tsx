"use client";

import { cn } from "@/lib/utils";
import { useRevealFlag } from "@/lib/motion";

/**
 * Section heading with the brand's amber "smile" underline.
 *
 * The legacy site wrote these as raw markup — `<h2>Why We are Most <span
 * class="heading--smile">Popular</span></h2>` — repeated across nine sections
 * and twelve pages, and the smile only animated because the parent happened
 * to carry a `.reveal.is-visible` class. Splitting it into a component means
 * the two-part structure is expressed once, the smile animation is triggered
 * by its own IntersectionObserver rather than by whatever class a grandparent
 * happens to have, and the reduced-motion fallback arrives automatically.
 */
export function SectionHeading({
  lead,
  accent,
  align = "center",
  as: Tag = "h2",
  headingTag,
  className,
  sub,
  id,
  action,
}: {
  /** Plain text before the accented word. */
  lead?: string;
  /** The word that gets the smile and the brand green. */
  accent: string;
  align?: "center" | "left";
  as?: "h1" | "h2" | "h3";
  /** Alias for `as`, for call sites where `as` is ambiguous. */
  headingTag?: "h1" | "h2" | "h3";
  className?: string;
  /** Optional supporting line beneath the heading. */
  sub?: string;
  id?: string;
  /** Optional control rendered to the right of the heading. */
  action?: React.ReactNode;
}) {
  const { ref, revealed } = useRevealFlag<HTMLDivElement>();
  const Heading = (headingTag ?? Tag) as "h1" | "h2" | "h3";

  return (
    <div
      ref={ref}
      className={cn(
        "reveal-group",
        action && "flex flex-wrap items-end justify-between gap-6",
        align === "center" && !action && "text-center",
        className,
      )}
      data-revealed={revealed || undefined}
    >
      <div className={cn(align === "center" && !action && "mx-auto max-w-2xl")}>
        <Heading
          id={id}
          className={cn(
            "text-balance text-3xl font-bold tracking-[-0.02em] text-ink-900 sm:text-4xl",
            align === "center" && !action && "mx-auto",
          )}
        >
          {lead ? <>{lead} </> : null}
          <span className="smile">{accent}</span>
        </Heading>
        {sub ? (
          <p
            className={cn(
              "mt-4 text-lg text-muted-foreground",
              align === "center" && !action && "mx-auto max-w-2xl",
            )}
          >
            {sub}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Centered content block with a reveal-on-scroll wrapper.
 *
 * This is the single place scroll reveals are triggered, replacing the
 * legacy `useReveal` hook that each page called independently with its own
 * IntersectionObserver configuration.
 */
export function Reveal({
  children,
  className,
  stagger = 0.08,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const { ref, revealed } = useRevealFlag<HTMLDivElement>();

  return (
    <Tag
      ref={ref as never}
      className={cn(
        revealed && "is-revealed",
        !revealed && "reveal-pending",
        className,
      )}
      style={{ ["--reveal-stagger" as string]: `${stagger}s` }}
    >
      {children}
    </Tag>
  );
}
