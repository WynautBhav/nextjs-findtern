import Link from "next/link";

import { AiLinkAction } from "@/components/admin/ai-link-action";
import { buttonClass } from "@/components/ui/button";
import { daysWaiting, type AiLinkState } from "@/lib/admin/ai-link-queue";
import type { AiLinkListRow } from "@/lib/admin/ai-link-queue-load";
import { shortDate } from "@/lib/format";
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
