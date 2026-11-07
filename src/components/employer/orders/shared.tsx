"use client";
import type { Tone } from "@/components/app/primitives";
import type { PlacementLedger } from "@/lib/dues";

import { useEffect, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const PLAN: Record<PlacementLedger["plan"], { label: string; tone: Tone }> = {
  upfront: { label: "Paid upfront", tone: "paid" },
  monthly: { label: "Monthly plan", tone: "live" },
  postpaid: { label: "Pay monthly", tone: "live" },
  full_time: { label: "Full-time", tone: "new" },
  unpaid: { label: "Not paid", tone: "waiting" },
};

export const STATUS: Record<PlacementLedger["status"], { label: string; tone: Tone }> = {
  fully_paid: { label: "Fully paid", tone: "paid" },
  partially_paid: { label: "Partly paid", tone: "waiting" },
  unpaid: { label: "Not paid", tone: "waiting" },
};

/** Per-currency sum, printed as "₹32,000 + $400". */
export function sumLabel(rows: { currency: string; minor: number }[]): string | null {
  const by = new Map<string, number>();
  for (const r of rows) if (r.minor > 0) by.set(r.currency, (by.get(r.currency) ?? 0) + r.minor);
  if (by.size === 0) return null;
  return Array.from(by.entries())
    .map(([c, m]) => formatMoney(m, c, { zeroLabel: false }))
    .join(" + ");
}

export function dateRange(start: string | null, end: string | null): string {
  if (!start) return "Start date not set";
  return end ? `${formatDate(start)} – ${formatDate(end)}` : `From ${formatDate(start)}`;
}

/* ── Shared search, reset and live region (Hires, Schedule, Invoices) ── */

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={labelClass}>
      Search
      <span className="relative mt-1.5 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(fieldClass, "pl-9")}
        />
      </span>
    </label>
  );
}

export function ResetButton({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={!enabled} onClick={onClick} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
      <RotateCcw className="size-4" aria-hidden />
      Reset
    </button>
  );
}

/** Screen-reader count, announced ~300ms after typing stops while any filter is active. */
export function LiveCount({ active, shown, total, noun }: { active: boolean; shown: number; total: number; noun: string }) {
  const message = active ? `${shown} of ${total} ${noun} shown` : "";
  const [announced, setAnnounced] = useState(message);
  useEffect(() => {
    const id = setTimeout(() => setAnnounced(message), 300);
    return () => clearTimeout(id);
  }, [message]);
  return (
    <p className="sr-only" role="status">
      {announced}
    </p>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/* ── Payment schedule (legacy "Upcoming payments") ──────────────────── */

