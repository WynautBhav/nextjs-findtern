import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { DriveActivity, DriveActivityList, type DriveActivityRow } from "@/components/college/drive-activity";
import { PastDriveCard } from "@/components/college/past-drive-card";

import { Panel, PanelBody, PanelHeader } from "@/components/college/panel";
import { CollegeHero } from "@/components/college/kit";
import { DrivePipeline, DriveSpread, EmployerArrivals, type SpreadRow } from "@/components/college/drive-graphics";
import { Surface } from "@/components/app/primitives";
import { yearLabel } from "@/lib/college/labels";
import { DriveBoardView } from "@/components/college/drive-board-view";
import { DriveBuilder } from "@/components/college/drive-builder";
import { DriveSummary } from "@/components/college/drive-summary";
import { DriveEmployersPanel } from "@/components/college/drive-employers";
import { LinkActions } from "@/components/college/link-actions";
import { PresenceLive } from "@/components/college/presence-live";
import { ButtonLink } from "@/components/ui/button";
import { driveWindow, readEligibility } from "@/lib/college/access";
import { closedDriveFinding } from "@/lib/college/drive-board";
import { loadDriveBoard } from "@/lib/college/drive-board-db";
import { loadDriveEmployers } from "@/lib/college/drive-employers-db";
import { loadDriveSummary } from "@/lib/college/drive-summary-db";
import { toLocalInput } from "@/lib/college/ist";
import { audienceLabel, DRIVE_KIND_LABEL, WINDOW_LABEL } from "@/lib/college/labels";
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
 * students offline or not open to work), what it has produced, the nudges sent, the employer alert, the link and the
 * edit form. Once it is over: the same board and lists, read-only (student names show; no nudges, no editing).
 * `?employer=<id>` narrows the board to the students one company met or offered to.
 */
export default async function DrivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; show?: string; view?: string; employer?: string; close?: string }> }) {
  const ctx = await requireCollegeContext();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const drive = await driveForCollegeAdmin(ctx, id);
  if (!drive) notFound();

  const now = requestTime();
  const w = driveWindow(drive, now);
  const open = driveDataOpen(drive);
  const [students, eligible] = await Promise.all([open ? studentsForCollegeAdmin(ctx) : Promise.resolve([]), eligibleStudents(drive)]);
  // P3: a hand-included student the officer has not verified shows name, roll, year and branch and nothing more:
  // no offers, meets, hires or presence (redactUnverified). So the board and the presence snapshot read verified students only.
  const verified = eligible.filter((s) => s.status === "verified");
  const presence = w === "live" ? await presenceSnapshot(ctx.college.id, verified.map((s) => s.userId)) : null;
  const toRef = (s: (typeof eligible)[number]) => {
    const r = toStudentRow(s);
    return { userId: r.userId, name: r.name, rollNo: r.rollNo, year: r.year, branch: r.branch, phone: r.phone, openToWork: r.openToWork };
  };
  const refs = eligible.map(toRef);
  const { board, view, byEmployer, filter, came, invited, missing } = await loadDriveBoard(drive, verified.map(toRef), presence ? presence.offline : null, now, open ? sp.employer : null, !open);
  const employers = await loadDriveEmployers(drive, verified.map((s) => s.userId), came, invited, open, now);
  // Drive summary: opened from the hero while the drive runs; always shown, under the hero, once it is over (names, read-only).
  const showSummary = !open || sp.view === "summary";
  const summary = showSummary
    ? await loadDriveSummary(drive, verified.map((s) => ({ ...toRef(s), score: s.score })), came, true)
    : null;
  const activity: DriveActivityRow[] = (
    await getDb()
      .select({ id: schema.driveActivityLogs.id, action: schema.driveActivityLogs.action, at: schema.driveActivityLogs.createdAt, company: schema.employers.companyName })
      .from(schema.driveActivityLogs)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.driveActivityLogs.employerId))
      .where(and(eq(schema.driveActivityLogs.driveId, drive.id), eq(schema.driveActivityLogs.collegeId, ctx.college.id)))
      .orderBy(desc(schema.driveActivityLogs.createdAt))
      .limit(50)
  ).map((r) => ({ id: r.id, action: r.action, at: r.at.toISOString(), company: r.company ?? "A company" }));

  // Last seen is activity: not shown for a student who is not verified yet.
  const rows = students.map(toStudentRow).map((r) => (r.status === "verified" ? r : { ...r, lastSeenAt: null }));
  const branches = [...new Set(rows.map((s) => s.branch).filter((b): b is string => Boolean(b)))].sort();
  const e = readEligibility(drive.eligibility);
  // Offers by branch and year: counts only, so they stay on a past drive too (a finished drive is read-only).
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
    ? closedDriveFinding(board.lists)
    : calls || offers || missing.length
      ? [calls ? `${plural(calls, "student hasn't", "students haven't")} answered a meet request` : null, offers ? `${plural(offers, "offer is", "offers are")} waiting on a reply` : null, missing.length ? `${plural(missing.length, "invited company hasn't", "invited companies haven't")} come in` : null]
          .filter(Boolean)
          .join(" · ")
      : "Nothing is waiting on you right now.";

  const timeline = (
    <EmployerArrivals
      start={drive.startsAt}
      end={drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt}
      now={now}
      arrivals={came.map((c) => ({ id: c.employerId, company: c.company ?? "Employer", at: c.joinedAt }))}
      missing={open ? missing.map((m) => m.company) : []}
    />
  );

  return (
    <div className="space-y-6">
      <CollegeHero
        title={drive.title}
        lede={`${DRIVE_KIND_LABEL[drive.kind] ?? drive.kind}${audienceLabel(drive.audience) ? ` · ${audienceLabel(drive.audience)}` : ""} · ${WINDOW_LABEL[w]} · ${fmt(drive.startsAt)} to ${fmt(drive.endsAt)} · ${plural(eligible.length, "student", "students")} in the drive`}
        actions={
          open ? (
            <>
              <ButtonLink
                href={sp.view === "summary" ? `/college/drives/${drive.id}` : `/college/drives/${drive.id}?view=summary#summary`}
                variant="outlineLight"
              >
                {sp.view === "summary" ? "Hide summary" : "Drive summary"}
              </ButtonLink>
              <ButtonLink href={`/college/drives/${drive.id}?edit=1#edit`} variant="white">Edit drive</ButtonLink>
              {/* The Link panel's own Close drive, opened at its confirm step: one flow, not a second copy. */}
              <ButtonLink href={`/college/drives/${drive.id}?close=1#link`} variant="outlineLight">Close drive</ButtonLink>
            </>
          ) : null
        }
      >
        {!open && summary ? (
          <PastDriveCard
            board={board}
            byEmployer={byEmployer}
            employers={employers}
            summary={summary}
            finding={finding}
            initialShow={sp.show}
            timeline={timeline}
            spread={spread.branches.length ? <div className="px-5 py-4 sm:px-6"><DriveSpread branches={spread.branches} years={spread.years} /></div> : null}
            activity={<DriveActivityList rows={activity} className="px-5 py-2 sm:px-6" />}
            activityCount={activity.length}
          />
        ) : (
        <>
        <p className="mt-6 max-w-3xl text-pretty text-base text-white">{finding}</p>
        <div className="mt-8">
          <DrivePipeline
            driveId={drive.id}
            open={open}
            stages={[
              { key: "all", label: "Students in the drive", value: eligible.length },
              { key: "called", label: "Asked to meet", value: board.lists.called.length },
              { key: "offers", label: "Got an offer", value: board.lists.offers.length },
              { key: "hired", label: "Hired", value: board.lists.hired.length },
            ]}
          />
        </div>
        <div className="mt-8 border-t border-white/10 pt-6">{timeline}</div>
        </>
        )}
      </CollegeHero>

      {/* A finished drive is the one card above: its lists open in pop-ups, so nothing else repeats them below. */}
      {!open ? null : (
      <>
      {summary ? <DriveSummary s={summary} open canAct={open} startedLabel={fmt(drive.startsAt)} /> : null}

      <DriveBoardView
        // Remounted when a link changes ?show= (hero pipeline, summary): the board opens that list instead of keeping its tab.
        key={`${filter?.employerId ?? "all"}:${sp.show ?? ""}`}
        board={view}
        open={open}
        initial={sp.show}
        filter={filter ? { company: filter.company, clearHref: `/college/drives/${drive.id}#board` } : null}
      />

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

      <DriveEmployersPanel driveId={drive.id} data={employers} over={!open} />

      {presence ? (
        <PresenceLive driveId={drive.id} driveTitle={drive.title} showTitle={false} startsAt={drive.startsAt.toISOString()} endsAt={drive.endsAt.toISOString()} initial={presence} />
      ) : null}

      <Panel id="link" className="scroll-mt-6">
          <PanelHeader
            title="Link"
            description={
              w === "revoked"
                ? "Closed. No employer can get in."
                : w === "ended"
                  ? "Ended. No employer can get in."
                  : "Send it to the companies you invite. They must sign in to Findtern. Close the drive at any time."
            }
          />
          {w === "ended" || w === "revoked" ? null : (
          <PanelBody>
            <LinkActions
              // Remounted when the hero's Close drive adds ?close=1, so it opens at the confirm step.
              key={sp.close === "1" ? "close" : "link"}
              driveId={drive.id}
              askClose={sp.close === "1" && open}
              collegeName={ctx.college.name}
              driveTitle={drive.title}
              startsAt={drive.startsAt.toISOString()}
              endsAt={drive.endsAt.toISOString()}
              kind={drive.kind}
            />
          </PanelBody>
          )}
      </Panel>

      <DriveActivity rows={activity} />
      </>
      )}

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
              collegeLogoUrl={ctx.college.logoUrl}
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
                audience: drive.audience === "tech" || drive.audience === "non_tech" ? drive.audience : "any",
                // Name and phone ride along on the stored rows (0055), so an edit opens them filled in.
                invitedEmployers: drive.invitedEmployers ?? invited,
              }}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
