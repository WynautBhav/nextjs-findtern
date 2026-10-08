import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Page hero.
 *
 * Every marketing page opens with the same three-part structure: an eyebrow
 * naming the section, an H1, and a lead line. Building it once means the
 * spacing rhythm, the optical size step and the contrast of secondary text
 * are identical on twelve pages instead of twelve slightly different
 * decisions.
 *
 * The eyebrow is a real `<p>` with an accessible label rather than an
 * all-caps `<h2>`, so it does not enter the heading outline and compete with
 * the H1.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
  align = "center",
  className,
  aside,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  /** Optional CTA row or supporting control. */
  children?: ReactNode;
  align?: "center" | "left";
  className?: string;
  /** Right-hand column, for a page that opens with a visual. */
  aside?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden border-b border-ink-100 bg-white",
        className,
      )}
    >
      {/* Two soft brand washes. Generated rather than an authored SVG so the
          page does not carry a decorative illustration it does not need. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_12%_-10%,rgb(14_96_73/0.07)_0%,transparent_62%),radial-gradient(ellipse_50%_60%_at_92%_0%,rgb(240_178_74/0.09)_0%,transparent_58%)]"
      />

      <div
        className={cn(
          "container-page relative grid gap-12 py-16 sm:py-20 lg:py-24",
          aside && "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16",
        )}
      >
        <div className={cn(align === "center" && !aside && "mx-auto max-w-3xl text-center")}>
          {eyebrow ? (
            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
          ) : null}

          <h1
            className={cn(
              "mt-5 text-balance text-[clamp(2.25rem,5.2vw,4rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-ink-900",
              eyebrow && "mt-4",
            )}
          >
            {title}
          </h1>

          {lead ? (
            <p
              className={cn(
                "mt-6 text-balance text-lg leading-relaxed text-muted-foreground",
                align === "center" && !aside && "mx-auto max-w-2xl",
              )}
            >
              {lead}
            </p>
          ) : null}

          {children ? (
            <div
              className={cn(
                "mt-9 flex flex-col gap-3 sm:flex-row",
                align === "center" && !aside && "justify-center",
              )}
            >
              {children}
            </div>
          ) : null}
        </div>

        {aside ? <div className="relative">{aside}</div> : null}
      </div>
    </section>
  );
}

/**
 * Page section.
 *
 * A `section` with a consistent `id` anchor target and the shared vertical
 * rhythm. `container-page` matches the 1200px max-width used everywhere else.
 */
export function PageSection({
  id,
  children,
  className,
  tone = "white",
  heading,
  lead,
  action,
}: {
  id?: string;
  children?: ReactNode;
  className?: string;
  tone?: "white" | "muted" | "brand";
  /** Rendered centred above the children. */
  heading?: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "section-y",
        tone === "muted" && "bg-ink-50/70",
        tone === "brand" && "brand-wash grain text-white",
        className,
      )}
    >
      <div className="container-page">
        {heading ? (
          <div className={cn("flex flex-wrap items-end justify-between gap-6", action && "mb-12")}>
            <div className="max-w-2xl">
              <h2
                className={cn(
                  "text-balance text-3xl font-semibold tracking-[-0.025em] sm:text-4xl",
                  tone === "brand" ? "text-white" : "text-ink-900",
                )}
              >
                {heading}
              </h2>
              {lead ? (
                <p
                  className={cn(
                    "mt-4 text-lg leading-relaxed",
                    tone === "brand" ? "text-on-dark-subtle" : "text-muted-foreground",
                  )}
                >
                  {lead}
                </p>
              ) : null}
            </div>
            {action}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
