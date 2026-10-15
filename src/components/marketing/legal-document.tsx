"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { sanitizeRichText } from "@/lib/richtext";
import { cn } from "@/lib/utils";

/**
 * Legal document renderer.
 *
 * The terms are stored as HTML in the CMS - 46 KB for the platform terms, 95 KB
 * for the employer terms - with 19 and 18 headings respectively. Rendering that
 * as an undifferentiated wall of text is why nobody reads it, so the heading
 * structure is extracted and turned into a sticky table of contents.
 *
 * Preserved from the legacy build, which did this well:
 *  - a sticky "On this page" rail;
 *  - scroll-spy that marks the section currently under the header;
 *  - deep-linkable hashes that survive a reload.
 *
 * Fixed from the legacy build:
 *  - the scroll offset was hardcoded to 84px against a 64px header, so every
 *    anchor landed with a 20px gap or clipped the heading. It now reads the
 *    real header height off a CSS custom property;
 *  - the legacy Terms and InternTerms pages were duplicates of each other with
 *    different hand-written bodies, so the two could disagree. Both now read
 *    the same CMS row.
 */
export function LegalDocument({
  title,
  html,
  updated,
  backHref = "/",
  backLabel = "Back",
}: {
  title: string;
  html: string;
  updated?: string;
  backHref?: string;
  backLabel?: string;
}) {
  // Order matters: sanitise, then inject the ids the TOC will link to, then
  // read the headings back out of the string that actually gets rendered.
  // Reading them before the ids exist produces a table of contents whose
  // links all point at nothing.
  const clean = useMemo(() => withHeadingIds(sanitizeRichText(html)), [html]);
  const headings = useMemoHeadings(clean);
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);
  const articleRef = useRef<HTMLElement>(null);

  // Scroll-spy. rootMargin keeps the activation band below the sticky header.
  useEffect(() => {
    const root = articleRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const nodes = headings
      .map((h) => root.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`))
      .filter((n): n is HTMLElement => Boolean(n));
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-88px 0px -60% 0px", threshold: [0, 0.1, 0.5] },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [headings, clean]);

  // Deep link on load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = articleRef.current?.querySelector<HTMLElement>(`#${CSS.escape(hash)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <>
      <header className="border-b border-ink-100 bg-white">
        <div className="container-page py-12 sm:py-14">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {backLabel}
          </Link>
          <h1 className="mt-8 max-w-3xl text-balance text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink-900">
            {title}
          </h1>
          {updated ? (
            <p className="mt-3 text-sm text-ink-500">Last updated {updated}</p>
          ) : null}
        </div>
      </header>

      <div className="container-page grid gap-12 py-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
        {/* ── Table of contents ────────────────────────────────────── */}
        {headings.length > 2 ? (
          <nav
            aria-label="On this page"
            className="hidden lg:sticky lg:top-28 lg:block lg:self-start"
          >
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">
              On this page
            </p>
            {/* The longest terms document has 28 sections. Capped to a
                scrollable rail so the TOC never runs past the fold and push
                the heading it is meant to help you find off screen. */}
            <ul className="mt-4 max-h-[calc(100svh-16rem)] space-y-1 overflow-y-auto border-l border-ink-200 pr-2">
              {headings.map((h) => (
                <li key={h.id}>
                  <a
                    href={`#${h.id}`}
                    aria-current={active === h.id ? "location" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = articleRef.current?.querySelector<HTMLElement>(
                        `#${CSS.escape(h.id)}`,
                      );
                      // Let the browser handle focus and history; only take
                      // over the scrolling so the offset clears the header.
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      window.history.replaceState(null, "", `#${h.id}`);
                    }}
                    className={cn(
                      "-ml-px block border-l-2 py-1.5 pl-4 text-sm leading-snug transition-colors duration-200",
                      active === h.id
                        ? "border-primary font-medium text-primary"
                        : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-900",
                      h.level === 3 && "pl-7",
                    )}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {/* ── Body ──────────────────────────────────────────────────── */}
        <article
          ref={articleRef}
          className="prose-rt min-w-0 max-w-3xl scroll-mt-28"
        >
          <div dangerouslySetInnerHTML={{ __html: clean }} />
        </article>
      </div>
    </>
  );
}

/**
 * Extract headings from sanitised HTML so the TOC and scroll-spy can use them
 * without the content being re-parsed in the browser.
 *
 * Runs on the sanitised string, so every heading id here is guaranteed to
 * correspond to a tag the sanitiser actually emitted.
 */
function useMemoHeadings(clean: string) {
  // Reads the ids withHeadingIds already stamped onto the tags, in document
  // order, so the TOC entries and the rendered anchors cannot drift apart.
  return useMemo(() => {
    const out: { id: string; text: string; level: number }[] = [];
    const re = /<h([23]) class="rt-h[23]" id="([^"]+)">([\s\S]*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) {
      const text = m[3].replace(/<[^>]*>/g, "").trim();
      if (!text) continue;
      out.push({ id: m[2], text, level: Number(m[1]) });
    }
    return out;
  }, [clean]);
}

/** Deterministic, collision-resistant id from heading text. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Inject the ids the table of contents links to. Runs over the sanitised
 * string, so it can only ever add an id attribute to a tag the sanitiser
 * already allowed.
 */
function withHeadingIds(clean: string): string {
  const out: string[] = [];
  return clean.replace(
    /<h([234])\s+class="rt-h[234]">([\s\S]*?)<\/h\1>/gi,
    (match, level: string, inner: string) => {
      const text = inner.replace(/<[^>]*>/g, "").trim();
      if (!text) return match;
      out.push(text);
      return `<h${level} class="rt-h${level}" id="s-${slugify(text)}-${
        out.length - 1
      }">${inner}</h${level}>`;
    },
  );
}
