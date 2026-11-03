import Link from "next/link";

import { AdminAvatar } from "@/components/admin/avatar";
import { AdminEmpty, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { activityWhen, type ActivityItem } from "@/lib/admin/dashboard-overview-pure";
import { cn } from "@/lib/utils";

/**
 * What happened lately: an avatar tinted by the person or company, "name verb object", a pastel status
 * chip and the day (India time). Each row is one link when this admin may open its page (`href` null: plain row).
 */
export function RecentActivity({ items, now }: { items: (Omit<ActivityItem, "href"> & { href: string | null })[]; now: Date }) {
  return (
    <Panel className="h-full" aria-labelledby="activity-title">
      <PanelHeader title={<span id="activity-title">Recent activity</span>} description="Payments, accepted offers, new projects and sign-ups" />
      <PanelBody>
        {items.length === 0 ? (
          <AdminEmpty title="Nothing yet" body="Payments, accepted offers, new projects and sign-ups show up here as they happen." />
        ) : (
          <ul className="-mx-2">
            {items.map((item) => {
              const body = (
                <>
                  <AdminAvatar name={item.name} id={item.tintKey} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm leading-5 text-foreground" title={`${item.name} ${item.verb} ${item.object}`.trim()}>
                      <span className="font-semibold">{item.name}</span> {item.verb}
                      {item.object ? <span className="font-medium"> {item.object}</span> : null}
                    </span>
                    <span className="block truncate text-xs leading-4 text-text-subtle">
                      <time dateTime={item.at.toISOString()}>{activityWhen(item.at, now)}</time>
                    </span>
                  </span>
                  <StatusBadge tone={item.status.tone} label={item.status.label} />
                </>
              );
              const row = "grid min-h-[var(--admin-row-h)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 outline-none";
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className={cn(row, "hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}
                    >
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
