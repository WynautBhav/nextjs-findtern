"use client";

import { Check, CircleCheck, CircleMinus, CirclePause, CirclePlay, Clock, Copy } from "lucide-react";

import { RowMenu, type RowMenuItem } from "@/components/app/row-menu";
import { Pill, type Tone } from "@/components/app/primitives";
import { Ledger, Money, type LedgerColumn } from "@/components/admin/money/ledger";
import type { PromoCode } from "@/lib/db/schema";
import { isFullWaiver } from "@/lib/full-waiver";
import { expiryRelative, promoState, usedShare, type PromoState } from "@/lib/admin/promo-state";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The promo codes as a ruled ledger: the code, what it gives, who it is for, how full it is (a bar only when there
 * is a limit), what it has cost in rupees, when it ends and its state (a word and an icon, never colour alone).
 * Presentational: the manager owns every action and hands it down.
 */

const STATE: Record<PromoState, { label: string; tone: Tone; icon: React.ReactNode }> = {
  active: { label: "Active", tone: "live", icon: <CircleCheck aria-hidden /> },
  paused: { label: "Paused", tone: "closed", icon: <CirclePause aria-hidden /> },
  used_up: { label: "Used up", tone: "waiting", icon: <CircleMinus aria-hidden /> },
  expired: { label: "Expired", tone: "closed", icon: <Clock aria-hidden /> },
};

export function PromoStateChip({ state }: { state: PromoState }) {
  const s = STATE[state];
  return (
    <Pill tone={s.tone} icon={s.icon} className="whitespace-nowrap">
      {s.label}
    </Pill>
  );
}

/** Who a code is for, in the words of the two payments it can discount. */
export function appliesLabel(appliesTo: string | null | undefined): string {
  return appliesTo === "intern" ? "Intern activation fee" : appliesTo === "employer" ? "Employer orders" : appliesTo === "subscription" ? "Employer subscription" : "Intern fees and employer orders";
}

export function givesLabel(p: Pick<PromoCode, "discountType" | "discountValue">): string {
  if (isFullWaiver(p)) return "Full waiver";
  return p.discountType === "percentage" ? `${p.discountValue}% off` : `${formatMoney(Number(p.discountValue), "INR", { zeroLabel: false })} off`;
}

export type PromoRowActions = {
  canWrite: boolean;
  onCopy: (p: PromoCode) => void;
  onToggle: (p: PromoCode) => void;
  onEdit: (p: PromoCode) => void;
  onDelete: (p: PromoCode) => void;
  onRedemptions: (p: PromoCode) => void;
};

export function PromoLedger({
  promos,
  nowMs,
  given,
  copied,
  rowError,
  actions,
}: {
  promos: PromoCode[];
  nowMs: number;
  /** Discount given per promo id, in INR paise. */
  given: Record<string, number>;
  copied: string | null;
  rowError: { id: string; message: string } | null;
  actions: PromoRowActions;
}) {
  const now = new Date(nowMs);
  const columns: LedgerColumn<PromoCode>[] = [
    {
      key: "code",
      header: "Code",
      primary: true,
      cell: (p) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="break-all font-display text-base font-semibold tracking-[0.02em] text-ink-900">{p.code}</span>
            <button
              type="button"
              onClick={() => actions.onCopy(p)}
              title="Copy code"
              aria-label={`Copy code ${p.code}`}
              className="grid size-9 shrink-0 place-items-center rounded-md text-ink-600 transition-colors hover:bg-ink-200/60 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 max-lg:size-11"
            >
              {copied === p.code ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            </button>
          </div>
          {p.description ? <p className="max-w-64 text-sm font-normal text-ink-600">{p.description}</p> : null}
          {rowError?.id === p.id ? (
            <p role="alert" className="mt-1 text-sm font-medium text-danger">
              {rowError.message}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "gives",
      header: "Gives",
      cell: (p) => (
        <div>
          <span className="nums font-medium text-ink-900">{givesLabel(p)}</span>
          {isFullWaiver(p) ? <span className="block text-xs text-ink-600">100% free</span> : null}
          {p.minOrderAmountMinor ? <span className="block text-xs text-ink-600">on orders over {formatMoney(p.minOrderAmountMinor, "INR", { zeroLabel: false })}</span> : null}
        </div>
      ),
    },
    { key: "applies", header: "Applies to", cell: (p) => <span className="text-ink-700">{appliesLabel(p.appliesTo)}</span> },
    {
      key: "used",
      header: "Used",
      cell: (p) => {
        const share = usedShare(p);
        const text = p.maxUsages ? `${p.usedCount.toLocaleString("en-IN")} of ${p.maxUsages.toLocaleString("en-IN")}` : p.usedCount > 0 ? `${p.usedCount.toLocaleString("en-IN")}, no limit` : "no limit";
        return (
          <div className="inline-block min-w-24 text-left md:block">
            {p.usedCount > 0 ? (
              <button
                type="button"
                onClick={() => actions.onRedemptions(p)}
                aria-label={`See the ${p.usedCount} ${p.usedCount === 1 ? "redemption" : "redemptions"} of ${p.code}`}
                className="nums rounded-sm text-ink-900 underline decoration-ink-300 decoration-1 underline-offset-4 hover:decoration-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                {text}
              </button>
            ) : (
              <span className={cn("nums", p.maxUsages ? "text-ink-900" : "text-ink-600")}>{text}</span>
            )}
            {share !== null ? (
              <div
                role="img"
                aria-label={`${Math.round(share * 100)}% of the limit used`}
                className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-ink-200 max-md:ml-auto"
              >
                <div className="h-full rounded-full bg-ink-800" style={{ width: `${share * 100}%` }} />
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "given",
      header: "Given",
      align: "right",
      cell: (p) => (given[p.id] ? <Money minor={given[p.id]} /> : <span className="text-ink-600">–</span>),
    },
    {
      key: "expires",
      header: "Expires",
      cell: (p) => {
        const abs = p.validUntil ? formatDate(new Date(p.validUntil).toISOString()) : undefined;
        return (
          <span title={abs} className={cn("whitespace-nowrap", p.validUntil ? "text-ink-900" : "text-ink-600")}>
            {expiryRelative(p.validUntil, now)}
          </span>
        );
      },
    },
    { key: "state", header: "State", cell: (p) => <PromoStateChip state={promoState(p, now)} /> },
    {
      key: "actions",
      header: "Manage",
      align: "right",
      cell: (p) => {
        const items: RowMenuItem[] = [
          { label: "See redemptions", onSelect: () => actions.onRedemptions(p) },
          ...(actions.canWrite && !isFullWaiver(p) ? [{ label: "Edit code", onSelect: () => actions.onEdit(p) }] : []),
          ...(actions.canWrite && !p.collegeId ? [{ label: "Delete code", onSelect: () => actions.onDelete(p), destructive: true }] : []),
        ];
        return (
          <div className="flex items-center justify-end gap-1">
            {actions.canWrite ? (
              <button
                type="button"
                onClick={() => actions.onToggle(p)}
                aria-label={`${p.isActive ? "Pause" : "Resume"} ${p.code}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-200/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 max-lg:min-h-11"
              >
                {p.isActive ? <CirclePause className="size-4" aria-hidden /> : <CirclePlay className="size-4" aria-hidden />}
                {p.isActive ? "Pause" : "Resume"}
              </button>
            ) : null}
            <RowMenu label={`More actions for ${p.code}`} items={items} />
          </div>
        );
      },
    },
  ];
  return <Ledger columns={columns} rows={promos} rowKey={(p) => p.id} caption="Promo codes" />;
}
