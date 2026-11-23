import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The drive overview's two blocks: the company's numbers in this drive (each a way into the list behind it) and the
 * next things to do. Plain links to the regular employer pages: a drive company hires the way every company does.
 */
export function DriveStats({ stats }: { stats: { label: string; value: number; href: string }[] }) {
  return (
    <section aria-labelledby="drive-stats" className="mb-8">
      <h2 id="drive-stats" className="sr-only">
        Your drive so far
      </h2>
      {/* Hairlines from the 1px gaps over the ink-100 ground: no per-cell border arithmetic. */}
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border border-ink-200/70 bg-ink-100 shadow-tile sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <li key={s.label} className="bg-white">
            <Link
              href={s.href}
              className="block h-full px-4 py-4 hover:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 sm:px-5"
            >
              <span className="nums block text-[1.75rem] font-light leading-none tracking-[-0.03em] text-ink-900">{s.value.toLocaleString("en-IN")}</span>
              <span className="mt-2 block text-sm text-ink-600">{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DriveActions({
  collegeName,
  actions,
}: {
  collegeName: string;
  actions: { title: string; body: string; href: string; primary?: boolean }[];
}) {
  return (
    <section aria-labelledby="drive-actions">
      <h2 id="drive-actions" className="text-lg font-semibold tracking-tight text-ink-900">
        Hire from {collegeName}
      </h2>
      <p className="mt-1 text-sm text-ink-600">The usual Findtern steps, with the drive&apos;s pricing applied for you.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((a) => (
          <li key={a.title}>
            <Link
              href={a.href}
              className={cn(
                "group flex h-full items-start gap-3 rounded-[24px] border p-5 shadow-tile transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                a.primary ? "border-brand-900 bg-brand-950 text-white hover:bg-brand-900" : "border-ink-200/70 bg-white hover:border-ink-300",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block font-semibold", a.primary ? "text-white" : "text-ink-900")}>{a.title}</span>
                <span className={cn("mt-1 block text-sm", a.primary ? "text-on-dark" : "text-ink-600")}>{a.body}</span>
              </span>
              <ArrowUpRight aria-hidden className={cn("size-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none", a.primary ? "text-white" : "text-brand-700")} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
