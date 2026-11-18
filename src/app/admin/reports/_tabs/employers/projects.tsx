import { Section, StatList } from "@/components/app/stat";
import { countOrNone } from "@/components/admin/money/rp-parts";
import { loadEmployerSummary } from "@/lib/admin/reports/employers-load";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

/** Project lifecycle: how many are live, paused, draft, closed. Resumes are not recorded, and the section says so. */
export default async function Projects({ window: w, now }: TabProps) {
  const { projects: p } = await loadEmployerSummary(w, now);
  const l = p.lifecycle;
  const none = countOrNone;
  const items = [
    { label: "All projects", value: none(l.total), hint: "Every status" },
    { label: "Published (live)", value: none(l.published), hint: p.takenDown ? `${formatNumber(p.liveNotTakenDown)} not taken down by an admin` : "Visible to interns" },
    { label: "Paused (hidden)", value: none(l.paused), hint: "Hidden by the employer, can be resumed" },
    { label: "Draft", value: none(l.draft), hint: "Not submitted yet" },
    { label: "In review", value: none(l.pending_review), hint: "Older flow" },
    { label: "Rejected", value: none(l.rejected), hint: "Sent back to draft by the employer" },
    { label: "Closed", value: none(l.closed), hint: "Ended" },
    { label: "Taken down by an admin", value: none(p.takenDown), hint: "A separate flag, any status" },
  ];
  return (
    <Section title="Projects" hint="Where every employer project stands today (test employers excluded). Not limited to the period.">
      <div data-rp="employers-projects" className="grid gap-x-12 md:grid-cols-2">
        <StatList items={items.slice(0, 4)} />
        <StatList items={items.slice(4)} className="border-t-0 md:border-t" />
      </div>
      {l.other ? <p className="mt-3 text-sm text-ink-700">{formatNumber(l.other)} projects have a status the app does not recognise.</p> : null}
      <p data-rp="resumed-note" className="mt-4 max-w-2xl text-sm text-ink-700">
        <span className="font-medium text-ink-900">Resumed projects are not recorded.</span> Pausing and resuming only changes the project&apos;s status and nothing keeps a history, so how many were resumed cannot be counted; {formatNumber(l.paused)} are paused right now. Recording each status change would make it exact.
      </p>
    </Section>
  );
}
