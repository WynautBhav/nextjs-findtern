"use client";

import { Briefcase, UserPlus } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Dark closing CTA.
 *
 * Preserved from the legacy `.about-cta-v2`, which appeared identically at the
 * bottom of Home, About, Employers, and Interns: dark green panel, a
 * two-word heading, and a pair of buttons - one to the employer flow, one to
 * the intern flow.
 *
 * The decoration is now generated rather than hand-authored SVG: the legacy
 * version inlined a three-path wave plus three absolutely positioned sparkle
 * divs with hand-tuned percentages. Three radial gradients give the same
 * depth for none of the markup.
 */
export function ClosingCta({
  heading = "Start hiring or apply now!",
  sub = "Two minutes to a profile. No fee above a 6 out of 10 score.",
  primary = { label: "Hire an intern", href: "/employers" },
  secondary = { label: "Register for an internship", href: "/signup" },
  tone = "brand",
}: {
  heading?: string;
  sub?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  tone?: "brand" | "dark";
}) {
  return (
    <section className="container-page py-10 sm:py-14">
      <div
        className={cn(
          "grain relative isolate overflow-hidden rounded-2xl px-6 py-14 text-center sm:px-12 sm:py-20",
          tone === "brand" ? "brand-wash" : "bg-ink-950",
        )}
      >
        {/* Decorative depth: one warm, one cool, one grounding. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-24 size-80 rounded-full bg-accent/12 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -right-16 size-96 rounded-full bg-brand-400/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-balance text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
            {heading}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-on-dark-subtle">{sub}</p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink
              href={primary.href}
              variant="accent"
              size="lg"
              block
              className="w-full sm:w-auto"
            >
              <Briefcase className="size-4" aria-hidden />
              {primary.label}
            </ButtonLink>
            <ButtonLink
              href={secondary.href}
              variant="outlineLight"
              size="lg"
              className="w-full sm:w-auto"
            >
              <UserPlus className="size-4" aria-hidden />
              {secondary.label}
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
