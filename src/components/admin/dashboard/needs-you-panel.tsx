import { CalendarOff, ClipboardCheck, Clock, Handshake, Link2Off, Mail, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Count } from "@/components/admin/motion";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { OwedBar } from "@/components/admin/triage/owed-bar";
import { TickCount } from "@/components/admin/triage/tick-count";
import type { QueueGroup, QueueKey } from "@/lib/admin/dashboard-queues.types";
import { queueRowHref, queueRows } from "@/lib/admin/dashboard-overview-pure";
import { cn } from "@/lib/utils";

const ICON: Record<QueueKey, LucideIcon> = {
  calendar: CalendarOff,
  payouts: Wallet,
  nolink: Link2Off,
  unscored: ClipboardCheck,
  messages: Mail,
  accepted: Handshake,
  sheets: Clock,
};

const ROW =
  "grid min-h-[var(--admin-row-h)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 outline-none";

/**
 * The seven queues as rows: icon, what it is, how many, how long the oldest has waited. Each row opens
 * the desk on that queue with its first record selected. A queue at zero is a plain row ("Clear"), and
 * one that failed to load says so; neither is a link, and neither is ever drawn as a number it does not know.
 * `canOpen` hides the destination of a state row (the calendar) from someone who may not open it.
 */
export function NeedsYouPanel({
  groups,
  total,
  nowMs,
  canOpen,
}: {
  groups: QueueGroup[];
  total: number;
  nowMs: number;
  canOpen: (href: string) => boolean;
}) {
  const rows = queueRows(groups, nowMs);
  const segments = groups.map((g) => ({ key: g.key, count: g.error ? 0 : g.count, flag: !!g.flag }));

  return (
    <Panel className="h-full" aria-labelledby="needs-you-title">
      <PanelHeader
        title={<span id="needs-you-title">Needs you</span>}
        description={
          <>
            <span data-testid="queue-total" className="nums font-semibold text-foreground">
              <TickCount value={total} />
            </span>{" "}
            {total === 1 ? "item is" : "items are"} waiting
          </>
        }
        action={
          <Link
            href="/admin/dashboard?desk=1"
            className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
          >
            View all
          </Link>
        }
      />
      <PanelBody className="space-y-3">
        <OwedBar segments={segments} />
        <ul className="-mx-2">
          {rows.map((row) => {
            const group = groups.find((g) => g.key === row.key);
            const Icon = ICON[row.key];
            const href = queueRowHref(row, group);
            const link = row.state === "work" || (row.state === "flag" && canOpen(href));
            const body = (
              <>
                <span aria-hidden className="grid size-9 place-items-center rounded-full bg-[color:var(--admin-panel-2)] text-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
                    {row.label}
                  </span>
                  {row.note ? (
                    <span className={cn("block truncate text-xs leading-4", row.state === "error" ? "text-danger" : "text-text-subtle")}>
                      {row.note}
                    </span>
                  ) : null}
                </span>
                {row.count != null ? (
                  <span data-testid={`queue-count-${row.key}`} className="nums text-base font-semibold text-foreground">
                    <Count value={row.count} />
                  </span>
                ) : null}
              </>
            );
            return (
              <li key={row.key}>
                {link ? (
                  <Link
                    href={href}
                    className={cn(ROW, "hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={ROW}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}
