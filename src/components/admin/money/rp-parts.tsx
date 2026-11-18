import Link from "next/link";
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

/** Small flat controls shared by the Reports tabs: same tokens as the rest of the admin, no pills. */

export const RP_FIELD =
  "h-10 rounded-md border border-ink-300 bg-surface-raised px-3 text-base text-ink-900 placeholder:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm touch:min-h-11";

export const RP_BUTTON =
  "inline-flex h-10 items-center gap-1.5 rounded-md border border-ink-300 bg-surface-raised px-3.5 text-sm font-medium text-ink-900 transition-colors duration-[var(--motion-fast)] hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";

/** A set of links that switch one view or filter (the current one is filled ink). */
export function Chips({ label, items }: { label: string; items: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {items.map((o) => (
        <Link
          key={o.href + o.label}
          href={o.href}
          scroll={false}
          aria-current={o.current ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11",
            o.current ? "bg-ink-900 text-canvas" : "text-ink-700 hover:bg-ink-200/60 hover:text-ink-900",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/** A file download: a plain outline button with an icon, the format named. */
export function DownloadLink({ href, label, children = "Export CSV" }: { href: string; label: string; children?: React.ReactNode }) {
  return (
    <a href={href} aria-label={label} className={RP_BUTTON}>
      <Download className="size-4" aria-hidden />
      {children}
    </a>
  );
}

/** What a section says when its query failed: the problem, that nothing changed, and the retry. Never a false zero. */
export function LoadNote({ what, retryHref }: { what: string; retryHref?: string }) {
  return (
    <div role="alert" className="border-y border-ink-200 py-4 text-sm text-ink-800">
      <p className="font-medium text-ink-900">Could not load {what}.</p>
      <p className="mt-1 text-ink-700">The database did not answer and nothing was changed.{retryHref ? " " : ""}
        {retryHref ? (
          <Link href={retryHref} className="font-medium text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700">
            Try again
          </Link>
        ) : null}
      </p>
    </div>
  );
}

/** A sentence that stands where a table would be: says why it is empty and what to do next. */
export function Said({ children }: { children: React.ReactNode }) {
  return <p className="border-y border-ink-200 py-4 text-sm text-ink-700">{children}</p>;
}

/** A group of sections on the page with one rhythm. */
export function Stack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-10 lg:space-y-12", className)}>{children}</div>;
}

/** Human window words used in every caption: "this month", "all time". */
export const windowWords = (w: { kind: string; label: string }) => (w.kind === "all" ? "all time" : w.label.toLowerCase());

/** "Sort by" links for a table: the active one is filled ink and carries an arrow and a spoken direction. */
export function SortLinks({ label, items }: { label: string; items: { label: string; href: string; active: boolean; dir: "asc" | "desc" }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-ink-600">Sort by</span>
      {items.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          scroll={false}
          aria-current={o.active ? "true" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11",
            o.active ? "bg-ink-900 text-canvas" : "text-ink-700 hover:bg-ink-200/60 hover:text-ink-900",
          )}
        >
          {o.label}
          {o.active ? <span aria-hidden> {o.dir === "asc" ? "↑" : "↓"}</span> : null}
          {o.active ? <span className="sr-only">, sorted {o.dir === "asc" ? "ascending" : "descending"}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** A name that links to its record: plain ink with an underline, never a coloured chip or avatar. */
export function NameLink({ href, children, sub }: { href: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <span className="block min-w-0">
      <Link href={href} className="font-medium text-ink-900 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {children}
      </Link>
      {sub ? <span className="block truncate text-xs text-ink-600">{sub}</span> : null}
    </span>
  );
}

/** A count for a list value: the number, or a quiet "none" (never a big bold zero). */
export function countOrNone(n: number): React.ReactNode {
  return n === 0 ? <span className="font-sans text-sm font-normal text-ink-600">none</span> : new Intl.NumberFormat("en-IN").format(n);
}
