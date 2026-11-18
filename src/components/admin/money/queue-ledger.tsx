import Link from "next/link";

import { cn } from "@/lib/utils";
import { itemsAndFlags } from "@/lib/admin/dashboard-queues-pure";
import type { QueueGroup } from "@/lib/admin/dashboard-queues.types";
import { queueRows, queueRowHref } from "@/lib/admin/dashboard-overview-pure";

/**
 * Admin's signature: the triage queue as a ruled ledger with an age column. One row per queue that has
 * work, the oldest item's age on the right (signal once it is more than a week old), a queue at zero is
 * one sentence, not a row. The count in the heading is the same figure as the hero (items, with the
 * calendar setting named beside it, never added in). There is no "view all" here: the hero owns that link.
 */
export function QueueLedger({ groups, nowMs, canOpen }: { groups: QueueGroup[]; nowMs: number; canOpen: (href: string) => boolean }) {
  const rows = queueRows(groups, nowMs);
  const live = rows.filter((r) => r.state !== "clear");
  const clear = rows.filter((r) => r.state === "clear");
  const total = groups.filter((g) => !g.error && !g.flag).reduce((n, g) => n + g.count, 0);
  const { flags } = itemsAndFlags(groups, total + groups.filter((g) => g.flag && !g.error && g.count > 0).length);
  const ageOf = (key: string) => {
    const g = groups.find((x) => x.key === key);
    const ages = (g?.records ?? []).map((r) => r.ageDays).filter((a): a is number => a != null && Number.isFinite(a));
    return ages.length ? Math.max(...ages) : null;
  };
  return (
    <section aria-labelledby="queue-title">
      <div className="flex items-baseline justify-between border-b-2 border-ink-800 pb-2">
        <h2 id="queue-title" className="text-lg font-semibold text-ink-900">In the queue</h2>
        <span className="text-sm text-ink-700">oldest waiting</span>
      </div>
      {live.length === 0 ? (
        <p className="py-4 text-sm text-ink-700">Everything is clear. New items appear here as they arrive.</p>
      ) : (
        <ul>
          {live.map((row) => {
            const group = groups.find((g) => g.key === row.key);
            const href = queueRowHref(row, group);
            const days = ageOf(row.key);
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{row.label}</span>
                  {row.state !== "work" && row.note ? <span className={cn("block text-xs", row.state === "error" ? "text-danger" : "text-ink-600")}>{row.note}</span> : null}
                </span>
                <span className="nums text-lg font-semibold text-ink-900">{row.count ?? (row.state === "flag" ? "Fix" : "")}</span>
                <span className={cn("nums w-14 text-right text-sm", days != null && days > 7 ? "font-semibold text-signal" : "text-ink-700")}>
                  {days == null ? "" : days === 0 ? "today" : `${days} d`}
                </span>
              </>
            );
            const cls = "grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-ink-200 py-3 outline-none transition-colors duration-[var(--motion-fast)] hover:bg-ink-100/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
            const link = row.state === "work" || (row.state === "flag" && canOpen(href));
            return <li key={row.key}>{link ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ul>
      )}
      <p className="pt-3 text-xs text-ink-600">
        {flags > 0 ? `${flags} ${flags === 1 ? "setting" : "settings"} to fix sits in the list but is not counted as work. ` : ""}
        {clear.length > 0 ? `${clear.length} ${clear.length === 1 ? "queue is" : "queues are"} clear.` : ""}
      </p>
    </section>
  );
}
