import type { Metadata } from "next";
import { ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { TiltCard } from "@/components/motion/tilt-card";
import { getBlogPosts } from "@/lib/content";
import { plainTextExcerpt, readingMinutes } from "@/lib/richtext";
import { tidyText } from "@/lib/text";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "How scoring, rate cards, timesheets and the guarantee actually work — written by the team that builds them.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage() {
  const posts = await getBlogPosts();
  const [lead, ...rest] = posts;

  return (
    <>
      <PageHero
        eyebrow="Read"
        title={
          <>
            How the model{" "}
            <span className="text-primary">actually works</span>.
          </>
        }
        lead="Scoring, rate cards, timesheets and the guarantee — the parts most platforms leave vague."
      />

      <PageSection>
        {/* ── Lead post ─────────────────────────────────────────── */}
        {lead ? (
          <TiltCard max={3} className="rounded-2xl">
            <Link
              href={`/blog/${lead.slug}`}
              className="group block overflow-hidden rounded-2xl border border-ink-200 bg-white"
            >
              <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="relative aspect-16/10 overflow-hidden bg-ink-100 lg:aspect-auto lg:min-h-72">
                  {/* The CMS has no cover images, so the lead card uses a
                      generated gradient keyed to the slug rather than a
                      stock photo that means nothing. */}
                  <div
                    aria-hidden
                    className={cn(
                      "absolute inset-0 bg-gradient-to-br",
                      gradientFor(lead.slug),
                    )}
                  />
                  <div className="absolute inset-0 flex items-end p-6">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-2xs font-semibold uppercase tracking-[0.12em] text-primary backdrop-blur">
                      Latest
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center p-7 sm:p-10">
                  <h2 className="text-balance text-2xl font-semibold tracking-[-0.025em] text-ink-900 transition-colors group-hover:text-primary sm:text-3xl">
                    {tidyText(lead.title)}
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                    {plainTextExcerpt(lead.body, 220)}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    Read the piece
                    <ArrowRight
                      className="size-4 transition-transform duration-300 [@media(any-hover:hover)]:group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                </div>
              </div>
            </Link>
          </TiltCard>
        ) : null}

        {/* ── Rest ───────────────────────────────────────────────── */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((post) => (
            <TiltCard key={post.id} max={5} className="rounded-2xl">
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white">
                <Link
                  href={`/blog/${post.slug}`}
                  className="group flex h-full flex-col"
                >
                  <div className="relative aspect-16/10 overflow-hidden bg-ink-100">
                    <div
                      aria-hidden
                      className={cn(
                        "absolute inset-0 bg-gradient-to-br transition-transform duration-500 ease-ease-out-expo [@media(any-hover:hover)]:group-hover:scale-105",
                        gradientFor(post.slug),
                      )}
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="text-balance text-lg font-semibold leading-snug tracking-tight text-ink-900 transition-colors group-hover:text-primary">
                      {tidyText(post.title)}
                    </h3>
                    <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {plainTextExcerpt(post.body, 150)}
                    </p>
                    <p className="mt-5 flex items-center gap-1.5 border-t border-ink-100 pt-4 text-xs text-ink-500">
                      <Clock3 className="size-3.5" aria-hidden />
                      {readingMinutes(post.body)} min read
                    </p>
                  </div>
                </Link>
              </article>
            </TiltCard>
          ))}
        </div>
      </PageSection>

      <PageSection tone="muted" className="text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-3xl">
          Still deciding?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          Read the rate card and the guarantee before you sign up for anything.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/pricing" variant="primary" size="lg">
            See pricing
          </ButtonLink>
          <ButtonLink href="/contact" variant="outline" size="lg">
            Ask a question
          </ButtonLink>
        </div>
      </PageSection>
    </>
  );
}

/**
 * Deterministic cover gradient per slug.
 *
 * The CMS has no cover images for any of the 23 posts, so the alternative is
 * either a stock photo that says nothing or a flat grey. A gradient keyed to
 * the slug gives each post a stable, distinct identity that survives without
 * an asset pipeline — and it is deterministic, so the same post is always the
 * same colour.
 */
function gradientFor(slug: string): string {
  const pairs = [
    "from-brand-800 via-brand-600 to-accent-500",
    "from-brand-900 via-brand-700 to-brand-400",
    "from-ink-900 via-brand-800 to-accent-400",
    "from-brand-700 via-brand-500 to-accent-400",
    "from-ink-800 via-brand-700 to-brand-500",
    "from-brand-950 via-brand-800 to-accent-500",
  ];
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return pairs[hash % pairs.length];
}
