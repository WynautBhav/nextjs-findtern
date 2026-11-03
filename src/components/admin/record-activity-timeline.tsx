import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Briefcase,
  CalendarClock,
  Clock,
  FileText,
  Handshake,
  ShieldCheck,
  UserPlus,
  Video,
  type LucideIcon,
} from "lucide-react";

import { AdminAvatar } from "@/components/admin/avatar";
import { humanizeStatus } from "@/components/admin/status-badge";
import type { ActivityEntry, ActivityKind } from "@/lib/admin/record-activity.types";
import { formatDate } from "@/lib/format";

/**
 * ActivityTimeline: the vertical "who did what to what, and when" list in the
 * Activities half of the record card. A person's own avatar marks an entry
 * they did; an entry nobody in particular did gets its kind's icon on a quiet
 * tone step. Dates are absolute (IST) so the server and the browser render
 * the same text. `entries` null means the list could not be loaded.
 */

const ICON: Record<ActivityKind, LucideIcon> = {
  proposal: FileText,
  offer: FileText,
  interview: Video,
  timesheet: Clock,
  payout: Banknote,
  payment: Banknote,
  document: FileText,
  review: ShieldCheck,
  project: Briefcase,
  hire: Handshake,
  signup: UserPlus,
};

function Dot({ entry }: { entry: ActivityEntry }) {
  if (entry.actor) return <AdminAvatar name={entry.actor.name} id={entry.actor.id ?? entry.actor.name} size="sm" />;
  const Icon = ICON[entry.kind] ?? CalendarClock;
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-[color:var(--admin-panel-2)] text-text-subtle">
      <Icon className="size-4" />
    </span>
  );
}

export function ActivityTimeline({ entries }: { entries: ActivityEntry[] | null }) {
  if (entries === null) {
    return (
      <p role="status" className="px-1 py-6 text-sm leading-relaxed text-text-subtle">
        Activity could not be loaded just now. Nothing was changed; reload the page to try again.
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="px-1 py-6">
        <p className="text-sm font-semibold text-foreground">No activity yet</p>
        <p className="mt-1 text-sm leading-relaxed text-text-subtle">
          Proposals, interviews, payments and reviews show up here as they happen.
        </p>
      </div>
    );
  }
  return (
    <ol aria-label="Activity, newest first" className="relative space-y-5 py-2">
      {entries.map((entry, index) => {
        const object = entry.object ? (
          entry.href ? (
            <Link href={entry.href} className="font-semibold text-foreground underline underline-offset-4 hover:text-[color:var(--admin-tile)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {entry.object}
            </Link>
          ) : (
            <span className="font-semibold text-foreground">{entry.object}</span>
          )
        ) : null;
        return (
          <li key={entry.id} className="relative flex gap-3">
            {/* The rail runs from this dot to the next; the last entry has none. */}
            {index < entries.length - 1 ? (
              <span aria-hidden className="absolute left-4 top-9 -bottom-5 w-px -translate-x-1/2 bg-[color:var(--admin-rule)]" />
            ) : null}
            <Dot entry={entry} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm leading-snug text-foreground [overflow-wrap:anywhere]">
                {entry.actor ? <span className="font-semibold">{entry.actor.name}</span> : null}
                {entry.actor ? " " : ""}
                {entry.verb}
                {object ? <> {object}</> : null}
              </p>
              {entry.detail ? <p className="mt-0.5 text-sm text-text-subtle [overflow-wrap:anywhere]">{entry.detail}</p> : null}
              {entry.change ? (
                <p className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-full bg-[color:var(--admin-panel-2)] px-2.5 py-1 text-xs font-medium text-foreground">
                  <span>{humanizeStatus(entry.change.from)}</span>
                  <ArrowRight className="size-3 shrink-0" aria-hidden />
                  <span className="sr-only">to</span>
                  <span>{humanizeStatus(entry.change.to)}</span>
                </p>
              ) : null}
              <p className="mt-1 text-xs text-text-subtle">
                <time dateTime={entry.at}>{formatDate(entry.at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
