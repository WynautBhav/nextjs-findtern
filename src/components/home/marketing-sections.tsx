"use client";

import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/section-heading";
import { Magnetic } from "@/components/motion/magnetic";

/**
 * Inline contact band.
 *
 * Sits between the pricing table and the dark closing CTA. The legacy build
 * had this as `components/ui/ContactCTA.tsx` — a hand-rolled component living
 * in the shadcn folder — and it was the only non-shadcn file in there that the
 * public site actually used.
 */
export function ContactCta({
  topLabel = "Not sure which plan fits? Talk to us",
  topHref = "/contact",
}: {
  topLabel?: string;
  topHref?: string;
}) {
  return (
    <section className="container-page py-14 sm:py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white px-6 py-10 shadow-sm sm:px-12 sm:py-12">
          {/* One warm accent, well clear of the text. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-accent/12 blur-3xl"
          />

          <div className="relative flex flex-col items-center gap-7 text-center lg:flex-row lg:justify-between lg:text-left">
            <div>
              <h2 className="text-balance text-2xl font-bold tracking-[-0.02em] text-ink-900 sm:text-3xl">
                Not sure which plan fits?
              </h2>
              <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground">
                Tell us the role and the duration. We will tell you which score
                band it usually falls into and what that costs.
              </p>
            </div>

            <Magnetic strength={0.3} className="shrink-0">
              <ButtonLink href={topHref} variant="primary" size="lg" block>
                {topLabel}
              </ButtonLink>
            </Magnetic>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
