import Link from "next/link";

import { AdminAvatar } from "@/components/admin/avatar";
import { AdminEmpty, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { relativeWhen, type ActivityItem } from "@/lib/admin/dashboard-overview-pure";
import { formatIst } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What happened lately: an avatar tinted by the person or company, "name verb object" (two lines, then a
 * cut with the full sentence in the title), and under it the status chip and how long ago, with the
 * exact India time in the tooltip. Each row is one link when this admin may open its page.
 */
export function RecentActivity({ items, now }: { items: (Omit<ActivityItem, "href"> & { href: string | null })[]; now: Date }) {
  return (
    <Panel aria-labelledby="activity-title">
      <PanelHeader title={<span id="activity-title">Recent activity</span>} />
      <PanelBody className="pt-2">
        {items.length === 0 ? (
          <AdminEmpty title="Nothing yet" body="Payments, accepted offers, new projects and sign-ups show up here as they happen." />
        ) : (
          <ul className="-mx-2">
            {items.map((item, i) => {
              const sentence = `${item.name} ${item.verb} ${item.object}`.trim();
              const body = (
                <>
                  <AdminAvatar name={item.lead ?? item.name} id={item.tintKey} size="sm" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm leading-5 text-foreground" title={sentence}>
                      <span className="font-semibold">{item.name}</span> {item.verb}
                      {item.object ? <span className="font-medium"> {item.object}</span> : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4 text-text-subtle">
                      <StatusBadge tone={item.status.tone} label={item.status.label} />
                      <time dateTime={item.at.toISOString()} title={`${formatIst(item.at)}`}>{relativeWhen(item.at, now)}</time>
                    </span>
                  </span>
                </>
              );
              const row = cn("grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl px-2 py-2 outline-none");
              return (
                <li key={item.id} className={i >= 3 ? "max-md:hidden" : undefined}>
                  {item.href ? (
                    <Link href={item.href} className={cn(row, "hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}>
                      {body}
                    </Link>
                  ) : (
                    <div className={row}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
