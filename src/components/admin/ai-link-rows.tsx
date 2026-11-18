import Link from "next/link";

import { AiLinkAction } from "@/components/admin/ai-link-action";
import { buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";
import { aiExpiryLabel, daysSince, type AiExpiryReason, type ExpiredAiRow } from "@/lib/admin/ai-interview-expiry";
import { daysWaiting, type AiLinkState } from "@/lib/admin/ai-link-queue";
import type { AiLinkListRow } from "@/lib/admin/ai-link-queue-load";
import { formatIstStamp, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The age figure a queue is sorted by: whole days since the interview was created (the link clock for "sent"). */
function AgeCell({ days, state, createdAt }: { days: number; state: AiLinkState; createdAt: Date | string | null }) {
  if (state === "completed") {
    return (
      <div>
        <p className="text-sm font-medium text-ink-900">Completed</p>
        <p className="nums text-xs text-ink-700">{createdAt ? shortDate(new Date(createdAt), { day: "numeric", month: "short" }) : "n/a"}</p>
      </div>
    );
  }
  return (
    <div>
      <p className={cn("nums font-display text-2xl font-semibold leading-none", state === "waiting" && days >= 2 ? "text-signal" : "text-ink-900")}>
        {days === 0 ? "Today" : days}
        {days === 0 ? null : <span className="ml-1 text-sm font-medium text-ink-700">{days === 1 ? "day" : "days"}</span>}
      </p>
      <p className="mt-1.5 text-xs text-ink-700">{state === "waiting" ? "waiting for a link" : "since the link went out"}</p>
    </div>
  );
}

/** One ruled row per interview, the age on the left (a grid from sm; stacked at 390 px). Shared by the dashboard card and /admin/ai-interviews. */
export function AiLinkRows({ rows, now, canWrite, state }: { rows: AiLinkListRow[]; now: Date; canWrite: boolean; state: AiLinkState }) {
  return (
    <ul className="divide-y divide-[color:var(--admin-rule)]">
      {rows.map((r) => {
        const days = daysWaiting(r.createdAt, now);
        return (
          <li key={r.interviewId} className="grid gap-x-6 gap-y-3 px-[var(--admin-pad-panel)] py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center">
            <AgeCell days={days} state={state} createdAt={r.createdAt} />
            <div className="min-w-0">
              <p className="break-words font-medium text-ink-900">
                <Link href={`/admin/interns/${r.internId}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {r.name}
                </Link>
              </p>
              <p className="break-all text-sm text-ink-700">{r.email}</p>
              <p className="text-sm text-ink-700">
                {r.phone} · asked {r.createdAt ? shortDate(new Date(r.createdAt), { day: "numeric", month: "short", year: "numeric" }) : "n/a"} IST · {r.paid ? (r.promo ? "promo activated" : "paid") : "unpaid"}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:items-end">
              {canWrite && r.paid && state !== "completed" && state !== "closed" ? (
                <AiLinkAction interviewId={r.interviewId} current={r.meetingLink ?? ""} label={state === "waiting" ? "Add link" : "Edit link"} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const dayStamp = (d: Date | string | null) => (d ? shortDate(new Date(d), { day: "numeric", month: "short", year: "numeric" }) : "n/a");
const ENDED_VERB: Record<AiExpiryReason, string> = { link_expired: "link ran out", missed: "marked missed", cancelled: "cancelled", no_show: "marked no-show" };
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
              <p className="break-all text-sm text-ink-700">{r.email}</p>
              <p className="text-sm text-ink-700">{r.phone}{r.projectName ? ` · ${r.projectName}` : ""}</p>
              <p className="nums mt-1 text-sm text-ink-700">
                {hasLink ? `Link sent ${dayStamp(r.linkSentAt)}` : "No link was sent"}
                {r.at ? (
                  <>
                    {" · "}
                    <span title={`${formatIstStamp(r.at)} IST`}>{ENDED_VERB[r.reason]} {dayStamp(r.at)}</span>
                    <span className="font-medium text-foreground"> · {since === 0 ? "today" : `${since} ${since === 1 ? "day" : "days"} ago`}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs font-medium text-ink-700">
                {r.reason === "link_expired" ? "Not taken" : String(r.status ?? "unknown").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} · {r.paid ? (r.promo ? "Promo activated" : "Paid") : "Unpaid"}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:items-end">
              {canWrite && r.paid && r.reason === "link_expired" ? (
                <>
                  <AiLinkAction interviewId={r.interviewId} label="Send a new link" />
                  <p className="text-xs text-ink-700 sm:text-right">A different link starts a new {days}-day window. Saving the same link changes nothing.</p>
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
