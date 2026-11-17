import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { loadEmployerSummary } from "@/lib/admin/reports/employers-load";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

/** Project lifecycle: how many are live, hidden (paused), draft, closed. Resumes are not recorded anywhere, and the panel says so. */
export default async function Projects({ window: w, now }: TabProps) {
  const { projects: p } = await loadEmployerSummary(w, now);
  const l = p.lifecycle;
  const items: [string, number, string][] = [
    ["All projects", l.total, "every status"],
    ["Published (live)", l.published, p.takenDown ? `${formatNumber(p.liveNotTakenDown)} not taken down by admin` : "visible to interns"],
    ["Paused (hidden)", l.paused, "hidden by the employer, can be resumed"],
    ["Draft", l.draft, "not submitted yet"],
    ["In review", l.pending_review, "older flow"],
    ["Rejected", l.rejected, "sent back to draft by the employer"],
    ["Closed", l.closed, "ended"],
    ["Taken down by admin", p.takenDown, "a separate flag, any status"],
  ];
  return (
    <Panel data-rp="employers-projects">
      <PanelHeader title="Projects" description="Where every employer project stands today (test employers excluded)." />
      <PanelBody>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          {items.map(([k, v, note]) => (
            <div key={k} className="min-w-0">
              <dt className="text-sm text-text-subtle">{k}</dt>
              <dd className="nums mt-0.5 text-2xl font-semibold text-foreground">{formatNumber(v)}</dd>
              <dd className="text-xs text-text-subtle">{note}</dd>
            </div>
          ))}
        </dl>
        {l.other ? <p className="mt-4 text-sm text-text-subtle">{formatNumber(l.other)} projects have a status the app does not recognise.</p> : null}
        <div className="mt-5 rounded-2xl bg-[color:var(--admin-panel-2)] p-4 text-sm leading-relaxed text-foreground" data-rp="resumed-note">
          <p className="font-semibold">Resumed projects: not recorded</p>
          <p className="mt-1 text-text-subtle">
            Pausing and resuming only changes the project&apos;s status; nothing keeps a history, so how many were resumed cannot be counted. What is known is how many are paused right now ({formatNumber(l.paused)}). Recording each status change would make this exact.
          </p>
        </div>
      </PanelBody>
    </Panel>
  );
}
