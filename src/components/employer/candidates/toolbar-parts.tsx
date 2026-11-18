import Link from "next/link";

import { cn } from "@/lib/utils";

/** A small joined control: per-page sizes, Rows/Cards. */
export function Segmented({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-0.5 rounded-full bg-ink-100/80 p-1", className)}>
      {children}
    </div>
  );
}

export function SegmentLink({ href, active, label, children }: { href: string; active: boolean; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      title={label}
      className={cn(
        "apple-spring inline-flex min-h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-sm font-medium touch:min-h-11 touch:min-w-11",
        active ? "bg-white text-brand-800 shadow-[0_1px_3px_rgb(7_47_36/0.18)]" : "text-ink-600 hover:text-ink-900",
      )}
    >
      {children}
    </Link>
  );
}
