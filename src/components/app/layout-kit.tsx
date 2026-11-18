import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** Responsive row of search / filter / sort / view controls. Wraps; never scrolls sideways. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div role="toolbar" className={cn("flex flex-wrap items-center gap-2 [&>*]:min-w-0", className)}>{children}</div>;
}

/** List + detail. Two columns from lg, one below. `stickyDetail` pins the detail pane. */
export function SplitPane({
  list,
  detail,
  stickyDetail = false,
  className,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  stickyDetail?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]", className)}>
      <div className="min-w-0">{list}</div>
      <div className={cn("min-w-0", stickyDetail && "lg:sticky lg:top-6")}>{detail}</div>
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-8 w-20 shrink-0" />
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-lg border border-ink-200 bg-surface-raised p-5", className)}>
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-9 w-28" />
    </div>
  );
}

export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("divide-y divide-ink-200/70", className)}>
      {Array.from({ length: rows }, (_, i) => <SkeletonRow key={i} />)}
    </div>
  );
}

/**
 * Loading shape for the ledger layouts: a masthead (title and lede), the lead figure with its note,
 * a ruled list beside it, then ruled rows. Flat blocks on hairlines, no cards, so what lands in
 * their place does not move. Announced once.
 */
export function LedgerSkeleton({ rows = 5, label = "Loading this page", className }: { rows?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div className="mb-8 space-y-3 lg:mb-10">
        <Skeleton className="h-9 w-64 max-w-full sm:h-11 sm:w-96" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid items-start gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-48 sm:h-[2.75rem]" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="border-y border-ink-200">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b border-ink-200 py-3 last:border-b-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-10">
        <div className="mb-1 flex items-center justify-between border-b border-ink-200 pb-2">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="divide-y divide-ink-200">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 py-3.5">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Quiet text-level fact: small label over a figure. Not a hero metric. */
export function InlineStat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-sm text-text-subtle">{label}</dt>
      <dd className="nums text-base font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

const CALLOUT = {
  info: { icon: Info, box: "bg-info-soft text-ink-800", ic: "text-info" },
  warning: { icon: AlertTriangle, box: "bg-accent-100 text-ink-900", ic: "text-accent-700" },
  success: { icon: CheckCircle2, box: "bg-success-soft text-ink-800", ic: "text-success" },
} as const;

/** Info / warning / success note with an icon. Full tint, no side stripe. */
export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof CALLOUT;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const c = CALLOUT[tone];
  const Icon = c.icon;
  return (
    <div role={tone === "warning" ? "alert" : "note"} className={cn("flex gap-3 rounded-md p-4 text-sm", c.box, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", c.ic)} />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  );
}
