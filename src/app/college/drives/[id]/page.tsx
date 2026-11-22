import { notFound } from "next/navigation";

import { Panel, PanelBody, PanelHeader } from "@/components/college/panel";
import { CollegeHero } from "@/components/college/kit";
import { DrivePipeline, DriveSpread, EmployerArrivals, type SpreadRow } from "@/components/college/drive-graphics";
import { Surface } from "@/components/app/primitives";
import { yearLabel } from "@/lib/college/labels";
import { DriveBoardView } from "@/components/college/drive-board-view";
import { DriveBuilder } from "@/components/college/drive-builder";
import { EmployerAlert } from "@/components/college/employer-alert";
import { LinkActions } from "@/components/college/link-actions";
import { PresenceLive } from "@/components/college/presence-live";
import { ButtonLink } from "@/components/ui/button";
import { driveWindow, readEligibility } from "@/lib/college/access";
import { loadDriveBoard } from "@/lib/college/drive-board-db";
import { toLocalInput } from "@/lib/college/ist";
import { DRIVE_KIND_LABEL, WINDOW_LABEL } from "@/lib/college/labels";
import { driveForCollegeAdmin, eligibleStudents, presenceSnapshot, requireCollegeContext, studentsForCollegeAdmin } from "@/lib/college/scope";
import { driveDataOpen, toStudentRow } from "@/lib/college/serialize";
import { shortDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** Request time for "x min ago". Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

/**
 * One campus drive. While it is open: what needs the officer now (calls and offers students haven't answered,
 * students offline), what it has produced, the employer alert, the link and the edit form. Once it is over: the
 * same figures as a report, without the student lists (C12).
 */
export default async function DrivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; show?: string }> }) {
  const ctx = await requireCollegeContext();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const drive = await driveForCollegeAdmin(ctx, id);
  if (!drive) notFound();

  const now = requestTime();
  const w = driveWindow(drive, now);
  const open = driveDataOpen(drive);
  const [students, eligible] = await Promise.all([open ? studentsForCollegeAdmin(ctx) : Promise.resolve([]), eligibleStudents(drive)]);
  const presence = w === "live" ? await presenceSnapshot(ctx.college.id, eligible.map((s) => s.userId)) : null;
  const refs = eligible.map((s) => {
    const r = toStudentRow(s);
    return { userId: r.userId, name: r.name, rollNo: r.rollNo, year: r.year, branch: r.branch, phone: r.phone };
  });
  const { board, came, invited, arrived, missing, walkIns } = await loadDriveBoard(drive, refs, presence ? presence.offline : null, now);

  const rows = students.map(toStudentRow);
  const branches = [...new Set(rows.map((s) => s.branch).filter((b): b is string => Boolean(b)))].sort();
  const e = readEligibility(drive.eligibility);
  // Offers by branch and year: counts only, so they stay on a past drive too (C12 closes the names, not the totals).
  const offeredIds = new Set(board.lists.offers.map((s) => s.userId));
  const hiredIds = new Set(board.lists.hired.map((s) => s.userId));
  const group = (key: (r: (typeof refs)[number]) => string) => {
    const m = new Map<string, SpreadRow>();
    for (const r of refs) {
      const k = key(r);
      const row = m.get(k) ?? { label: k, inDrive: 0, offered: 0, hired: 0 };
      row.inDrive++;
      if (offeredIds.has(r.userId)) row.offered++;
      if (hiredIds.has(r.userId)) row.hired++;
      m.set(k, row);
    }
    return [...m.values()];
  };
  const spread = {
    branches: group((r) => r.branch ?? "Branch not set").sort((a, b) => b.offered - a.offered || b.inDrive - a.inDrive).slice(0, 8),
    years: group((r) => (r.year ? yearLabel(r.year) : "Year not set")).sort((a, b) => a.label.localeCompare(b.label)),
  };
  const calls = board.lists.meetingsWaiting.length;
  const offers = board.lists.offersWaiting.length;
  const finding = !open
    ? `${plural(board.offerCount, "offer", "offers")}, ${plural(board.lists.meetings.length, "meeting", "meetings")} and ${plural(board.lists.internships.length + board.lists.fullTime.length, "hire", "hires")} came out of this drive.`
    : calls || offers || missing.length
      ? [calls ? `${plural(calls, "student hasn't", "students haven't")} answered a call` : null, offers ? `${plural(offers, "offer is", "offers are")} waiting on a reply` : null, missing.length ? `${plural(missing.length, "invited company hasn't", "invited companies haven't")} come in` : null]
          .filter(Boolean)
          .join(" · ")
      : "Nothing is waiting on you right now.";

  return (
    <div className="space-y-6">
      <CollegeHero
        title={drive.title}
        lede={`${DRIVE_KIND_LABEL[drive.kind] ?? drive.kind} · ${WINDOW_LABEL[w]} · ${fmt(drive.startsAt)} to ${fmt(drive.endsAt)} · ${plural(eligible.length, "student", "students")} in the drive`}
        actions={open ? <ButtonLink href={`/college/drives/${drive.id}?edit=1#edit`} variant="white">Edit drive</ButtonLink> : null}
      >
        <p className="mt-6 max-w-3xl text-pretty text-base text-white">{finding}</p>
        <div className="mt-8">
          <DrivePipeline
            driveId={drive.id}
            open={open}
            stages={[
              { key: "all", label: "Students in the drive", value: eligible.length },
              { key: "called", label: "Called by an employer", value: board.lists.called.length },
              { key: "offers", label: "Got an offer", value: board.lists.offers.length },
              { key: "hired", label: "Hired", value: board.lists.hired.length },
            ]}
          />
        </div>
        <div className="mt-8 border-t border-white/10 pt-6">
          <EmployerArrivals
            start={drive.startsAt}
            end={drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt}
            now={now}
            arrivals={came.map((c) => ({ id: c.employerId, company: c.company ?? "Employer", at: c.joinedAt }))}
            missing={open ? missing.map((m) => m.company) : []}
          />
        </div>
      </CollegeHero>

      {open ? <DriveBoardView board={board} live={w === "live"} open={open} initial={sp.show} /> : null}

      {spread.branches.length > 0 ? (
        <Surface className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink-900">Offers by branch and year</h2>
            <p className="nums text-sm text-text-subtle">{plural(board.lists.offers.length, "student", "students")} offered · {board.lists.hired.length} hired</p>
          </div>
          <div className="mt-4">
            <DriveSpread branches={spread.branches} years={spread.years} />
          </div>
        </Surface>
      ) : null}

      <EmployerAlert invited={invited} arrived={arrived} missing={missing} came={came} walkIns={walkIns} over={!open} />

      {presence ? (
        <PresenceLive driveId={drive.id} driveTitle={drive.title} showTitle={false} startsAt={drive.startsAt.toISOString()} endsAt={drive.endsAt.toISOString()} initial={presence} />
      ) : null}

      <Panel>
          <PanelHeader
            title="Link"
            description={
              w === "revoked"
                ? "Turned off. No employer can get in."
                : w === "ended"
                  ? "Ended. No employer can get in."
                  : "Send it to the companies you invite. They must sign in to Findtern. Turn the drive off at any time."
            }
          />
          <PanelBody>
            <LinkActions
              driveId={drive.id}
              revoked={w === "revoked"}
              collegeName={ctx.college.name}
              driveTitle={drive.title}
              startsAt={drive.startsAt.toISOString()}
              endsAt={drive.endsAt.toISOString()}
              kind={drive.kind}
            />
          </PanelBody>
      </Panel>

      {/* Folded unless asked for (Edit drive): the page is about the drive running. Gone once it is over. */}
      {open ? (
        <details id="edit" open={sp.edit === "1"} className="group scroll-mt-6 rounded-apple-xl border border-ink-200/80 bg-white shadow-xs">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-sm font-semibold text-ink-900 hover:bg-ink-50">
            Edit dates, invited companies and eligibility
            <span aria-hidden className="font-medium text-brand-700 group-open:hidden">Open</span>
          </summary>
          <div className="border-t border-ink-100 p-5">
            <DriveBuilder
              collegeId={ctx.college.id}
              collegeName={ctx.college.name}
              students={rows}
              branches={branches}
              live={w === "live"}
              initial={{
                id: drive.id,
                title: drive.title,
                kind: drive.kind === "full_time" ? "full_time" : "internship",
                description: drive.description ?? "",
                startsAt: toLocalInput(drive.startsAt),
                endsAt: toLocalInput(drive.endsAt),
                minCgpa: e.minCgpa?.toString() ?? "",
                minScore: e.minScore?.toString() ?? "",
                years: e.years ?? [],
                branches: e.branches ?? [],
                includeUserIds: drive.includeUserIds,
                excludeUserIds: drive.excludeUserIds,
                invitedEmployers: invited,
              }}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
