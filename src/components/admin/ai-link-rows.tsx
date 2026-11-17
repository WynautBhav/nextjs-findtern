import Link from "next/link";

import { AiLinkAction } from "@/components/admin/ai-link-action";
import { buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { aiExpiryLabel, daysSince, type AiExpiryReason, type ExpiredAiRow } from "@/lib/admin/ai-interview-expiry";
import { daysWaiting, type AiLinkState } from "@/lib/admin/ai-link-queue";
import type { AiLinkListRow } from "@/lib/admin/ai-link-queue-load";
import { formatIstStamp, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Stacked rows (one column at 390 px, a grid from sm): who, when, paid, and the action. Shared by the dashboard card and /admin/ai-interviews. */
export function AiLinkRows({ rows, now, canWrite, state }: { rows: AiLinkListRow[]; now: Date; canWrite: boolean; state: AiLinkState }) {
  return (
    <ul className="divide-y divide-[color:var(--admin-rule)]">
      {rows.map((r) => {
        const days = daysWaiting(r.createdAt, now);
        return (
          <li key={r.interviewId} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-center sm:px-5">
            <div className="min-w-0">
              <p className="break-words font-medium text-foreground">{r.name}</p>
              <p className="break-all text-sm text-text-subtle">{r.email}</p>
              <p className="text-sm text-text-subtle">
                {r.phone} · {r.createdAt ? shortDate(new Date(r.createdAt), { day: "numeric", month: "short", year: "numeric" }) : "n/a"} IST
                {state === "waiting" ? <span className={cn("ml-1 font-medium", days >= 2 && "text-danger")}> · {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} waiting`}</span> : null}
              </p>
              <p className="mt-0.5 text-xs font-medium text-text-subtle">{r.paid ? (r.promo ? "Promo activated" : "Paid") : "Unpaid"}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:items-end">
              {canWrite && r.paid && state !== "completed" && state !== "closed" ? (
                <AiLinkAction interviewId={r.interviewId} current={r.meetingLink ?? ""} label={state === "waiting" ? "Add link" : "Edit link"} />
              ) : null}
              <Link href={`/admin/interns/${r.internId}`} className={cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11 max-sm:w-full")}>
                Profile
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const dayStamp = (d: Date | string | null) => (d ? shortDate(new Date(d), { day: "numeric", month: "short", year: "numeric" }) : "n/a");
const EXPIRED_TONE: Record<AiExpiryReason, "danger" | "warning" | "neutral"> = { link_expired: "danger", missed: "danger", cancelled: "neutral", no_show: "danger" };

/**
 * The Expired tab: who, why, when the link went out, when it expired and how long ago. The one action is the
 * existing link editor (a new link restarts the clock), offered only where it can help: a paid candidate whose
 * link ran out. A missed or cancelled interview has no action here.
 */
export function AiExpiredRows({ rows, now, canWrite, days }: { rows: ExpiredAiRow<AiLinkListRow>[]; now: Date; canWrite: boolean; days: number }) {
  return (
    <ul className="divide-y divide-[color:var(--admin-rule)]" data-testid="ai-expired-rows">
      {rows.map((r) => {
        const since = daysSince(r.at, now);
        const hasLink = Boolean(r.meetingLink?.trim());
        return (
          <li key={r.interviewId} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-center sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="break-words font-medium text-foreground">{r.name}</p>
                <StatusBadge tone={EXPIRED_TONE[r.reason]} label={aiExpiryLabel(r.reason, days)} />
              </div>
              <p className="break-all text-sm text-text-subtle">{r.email}</p>
              <p className="text-sm text-text-subtle">{r.phone}{r.projectName ? ` · ${r.projectName}` : ""}</p>
              <p className="nums mt-1 text-sm text-text-subtle">
                {hasLink ? `Link sent ${dayStamp(r.linkSentAt)}` : "No link was sent"}
                {r.at ? (
                  <>
                    {" · "}
                    <span title={`${formatIstStamp(r.at)} IST`}>{r.reason === "link_expired" ? "expired" : "closed"} {dayStamp(r.at)}</span>
                    <span className="font-medium text-foreground"> · {since === 0 ? "today" : `${since} ${since === 1 ? "day" : "days"} ago`}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs font-medium text-text-subtle">
                Status: {String(r.status ?? "unknown").replace(/_/g, " ")} · {r.paid ? (r.promo ? "Promo activated" : "Paid") : "Unpaid"}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:items-end">
              {canWrite && r.paid && r.reason === "link_expired" ? (
                <>
                  <AiLinkAction interviewId={r.interviewId} label="Send a new link" />
                  <p className="text-xs text-text-subtle sm:text-right">A different link restarts the {days}-day window; saving the same one does not.</p>
                </>
              ) : null}
              <Link href={`/admin/interns/${r.internId}`} className={cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11 max-sm:w-full")}>
                Profile
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
