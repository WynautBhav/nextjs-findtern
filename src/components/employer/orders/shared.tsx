"use client";
import type { Tone } from "@/components/app/primitives";
import type { PlacementLedger } from "@/lib/dues";
import type { HireRow } from "./types";

import { useEffect, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const PLAN: Record<PlacementLedger["plan"], { label: string; tone: Tone }> = {
  upfront: { label: "Paid upfront", tone: "paid" },
  monthly: { label: "Monthly plan", tone: "live" },
  postpaid: { label: "Pay monthly", tone: "live" },
  full_time: { label: "Full-time", tone: "new" },
  // The hire itself is paid (it is listed); this is the instalment plan, so say that.
  unpaid: { label: "No instalment paid yet", tone: "waiting" },
};

export const STATUS: Record<PlacementLedger["status"], { label: string; tone: Tone }> = {
  fully_paid: { label: "Fully paid", tone: "paid" },
  partially_paid: { label: "Partly paid", tone: "waiting" },
  unpaid: { label: "No instalment paid", tone: "waiting" },
};

/** The white card the search and filters sit in, as on Candidates. */
export const TOOLBAR_CARD = "mb-4 rounded-2xl border border-ink-200 bg-white p-3 shadow-xs sm:p-4";

export const INLINE_LINK = "font-medium text-brand-700 underline underline-offset-4 touch:inline-flex touch:min-h-11 touch:items-center";

/** "25 Jan 2027 – 24 Apr 2027": one date format, kept on one line wherever it is shown. */
export function dateRange(start: string | null, end: string | null): string {
  if (!start) return "Start date not set";
  return end ? `${formatDate(start)} – ${formatDate(end)}` : `From ${formatDate(start)}`;
}

/** The hiring fee actually paid so far: it rides on the first payment, so it is paid once anything is. */
export function feePaidMinor(h: HireRow): number {
  return h.ledger.paidMinor > 0 ? Math.min(h.feeMinor, h.ledger.paidMinor) : 0;
}

/* ── Shared search, reset and live region (Hires, Schedule, Invoices) ── */

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={labelClass}>
      {/* The placeholder says what it searches; the word "Search" cost a line on phones. */}
      <span className="sr-only">Search</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
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
  // Shown only when there is something to reset: a disabled button on its own row was noise.
  if (!enabled) return null;
  return (
    <button type="button" onClick={onClick} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
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
