import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, FileWarning, Hourglass, RotateCcw, Search, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { humanizeStatus } from "@/components/app/status";
import { TONE_CLASS, toneForStatus, type StatusTone } from "@/lib/admin/status-tone";

/**
 * The money screens' status chip: icon + word + tone, never colour alone. One map for orders, payments,
 * payouts, refunds and subscriptions so "paid" looks the same on every admin money screen.
 */

const ICON: Record<string, LucideIcon> = {
  paid: CheckCircle2,
  settled: CheckCircle2,
  refunded: RotateCcw,
  partially_refunded: RotateCcw,
  created: Clock,
  pending: Clock,
  initiated: Hourglass,
  processing: Hourglass,
  eligible: CircleDashed,
  review: Search,
  failed: XCircle,
  cancelled: Ban,
  void: Ban,
  expired: Ban,
  revoked: Ban,
  active: CheckCircle2,
  expiring: Hourglass,
  needs_review: AlertTriangle,
  credit_note: FileWarning,
};

const TONE_OVERRIDE: Record<string, StatusTone> = {
  created: "warning",
  eligible: "info",
  review: "warning",
  initiated: "info",
  expiring: "warning",
  needs_review: "danger",
  credit_note: "warning",
  revoked: "danger",
};

const LABEL: Record<string, string> = {
  created: "Unpaid",
  needs_review: "Needs review",
  credit_note: "Credit note needed",
  eligible: "Ready to refund",
  review: "Check first",
};

export function StatusChip({ status, label, tone, className }: { status: string; label?: string; tone?: StatusTone; className?: string }) {
  const key = status.toLowerCase();
  const resolved = tone ?? TONE_OVERRIDE[key] ?? toneForStatus(key);
  const Icon = ICON[key] ?? CircleDashed;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium", TONE_CLASS[resolved].pill, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label ?? LABEL[key] ?? humanizeStatus(key)}
    </span>
  );
}
