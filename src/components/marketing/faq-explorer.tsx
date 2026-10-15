"use client";

import {
  Accordion as AccordionPrimitive,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Filterable FAQ.
 *
 * Built on the shadcn accordion, so the keyboard contract - Enter/Space to
 * toggle, arrow keys to move between headers, Home/End to jump - is Radix's
 * rather than reimplemented here.
 *
 * Two behaviours worth naming, both fixes:
 *
 *  - The search filters on question *and* answer. The legacy Faq.tsx
 *    filtered on the question text only, so a visitor searching "refund"
 *    got nothing for a question phrased "What happens to my deposit?".
 *
 *  - The category chips are derived from the data after trimming, so the
 *    upstream "Employer " category with its trailing space no longer produces
 *    a third chip that looks identical to the second.
 */
export function FaqExplorer({
  items,
  className,
  showSearch = true,
  showChips = true,
}: {
  items: { id: string; category: string; question: string; answer: string }[];
  className?: string;
  showSearch?: boolean;
  showChips?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add((i.category || "General").trim()));
    return ["All", ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const inCategory = category === "All" || item.category.trim() === category;
      if (!inCategory) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
      );
    });
  }, [items, query, category]);

  return (
    <div className={className}>
      {showSearch || showChips ? (
        <div className="mb-8 flex flex-col gap-4">
          {showSearch ? (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions and answers"
                aria-label="Search frequently asked questions"
                className="h-12 w-full rounded-xl border border-ink-200 bg-white pl-11 pr-11 text-base text-ink-900 shadow-sm transition-colors duration-200 placeholder:text-ink-400 hover:border-ink-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}

          {showChips && categories.length > 2 ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by topic">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-200",
                    category === c
                      ? "border-primary bg-primary text-white"
                      : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-300 px-6 py-12 text-center text-muted-foreground">
          Nothing matches “{query}”. Try a shorter phrase, or{" "}
          <a href="/contact" className="text-primary underline underline-offset-4">
            ask us directly
          </a>
          .
        </p>
      ) : (
        <AccordionPrimitive
          type="single"
          collapsible
          className="overflow-hidden rounded-2xl border border-ink-200 bg-white"
        >
          {filtered.map((item) => (
            <AccordionItem
              key={item.id}
              value={item.id}
              className="border-b border-ink-100 last:border-b-0 data-[state=open]:bg-brand-50/40"
            >
              <AccordionTrigger className="px-5 py-5 text-left text-base font-medium text-ink-900 hover:no-underline sm:px-7 sm:text-lg">
                <span className="flex-1 pr-4">{item.question}</span>
                <span className="mr-3 hidden shrink-0 rounded-full bg-ink-100 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.1em] text-ink-600 sm:inline">
                  {item.category}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-6 sm:px-7">
                <p className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </AccordionPrimitive>
      )}

      <p className="mt-8 text-sm text-ink-500">
        Showing {filtered.length} of {items.length}. Still stuck?{" "}
        <a
          href="mailto:admin@findtern.in"
          className="inline-flex items-center py-1 font-medium text-primary underline underline-offset-4"
        >
          admin@findtern.in
        </a>
      </p>
    </div>
  );
}
