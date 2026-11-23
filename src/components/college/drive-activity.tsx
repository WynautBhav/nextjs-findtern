import { shortDateTime } from "@/lib/format";
import { Panel, PanelBody, PanelHeader } from "./panel";

export type DriveActivityRow = { id: string; company: string; action: string; at: string };

const LABEL: Record<string, string> = {
  joined_drive: "joined the drive",
  viewed_candidates: "looked at your students",
  shortlisted_candidate: "shortlisted a student",
  sent_internship_offer: "sent an internship offer",
  sent_fulltime_offer: "sent a full-time offer",
  exited_drive_early: "left the drive early",
  drive_auto_completed: "drive ended for them",
};

/** What each company did in the drive, newest first, from drive_activity_logs. Companies only: no student names here. */
export function DriveActivity({ rows }: { rows: DriveActivityRow[] }) {
  return (
    <Panel>
      <PanelHeader title="Company activity" description="What each company did in this drive, newest first." />
      <PanelBody>
        {rows.length === 0 ? (
          <p className="text-sm text-text-subtle">No company has done anything in this drive yet.</p>
        ) : (
          <ol className="divide-y divide-ink-100">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm">
                <span className="min-w-0 text-ink-800">
                  <span className="font-semibold text-ink-900">{r.company}</span> {LABEL[r.action] ?? r.action}
                </span>
                <time dateTime={r.at} className="nums shrink-0 text-text-subtle">
                  {shortDateTime(new Date(r.at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>
    </Panel>
  );
}
