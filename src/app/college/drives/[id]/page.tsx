import { headers } from "next/headers";
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
import { shownDriveLink } from "@/lib/college/drive-link";
import { driveCodeSecret } from "@/lib/drives/code-derive";
import { tryPublicOrigin } from "@/lib/origin";
import { degreeOptions, normDegree } from "@/lib/college/eligibility";
import { closedDriveFinding } from "@/lib/college/drive-board";
import { loadDriveBoard, loadDrivePool } from "@/lib/college/drive-board-db";
import { loadDriveEmployers } from "@/lib/college/drive-employers-db";
import { loadDriveSummary } from "@/lib/college/drive-summary-db";
import { toLocalInput } from "@/lib/college/ist";
import { buildPeople } from "@/lib/college/pop-table";
import { driveReach } from "@/lib/college/drive-reach";
import { readinessForMany } from "@/lib/college/student-readiness-db";
import { aiStatusLabel, audienceLabel, DRIVE_KIND_LABEL, WINDOW_LABEL } from "@/lib/college/labels";
import { driveForCollegeAdmin, eligibleStudents, presenceSnapshot, requireCollegeContext, studentsForCollegeAdmin } from "@/lib/college/scope";
import { driveDataOpen, toStudentRow } from "@/lib/college/serialize";
import { shortDateTime } from "@/lib/format";
import { LiveRefresh } from "@/components/app/live-refresh";

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
  // The drive link needs an absolute origin; only a dev box without PUBLIC_ORIGIN falls back to the request's host.
  const h = await headers();
  const origin = tryPublicOrigin() ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost"}`;
  const w = driveWindow(drive, now);
  const open = driveDataOpen(drive);
  const [students, eligible] = await Promise.all([open ? studentsForCollegeAdmin(ctx) : Promise.resolve([]), eligibleStudents(drive)]);
  // P3: a hand-included student the officer has not verified shows name, roll, year and branch and nothing more:
  // no offers, meets, hires or presence (redactUnverified). So the board and the presence snapshot read verified students only.
  const verified = eligible.filter((s) => s.status === "verified");
  const presence = w === "live" ? await presenceSnapshot(ctx.college.id, verified.map((s) => s.userId)) : null;
  const toRef = (s: (typeof eligible)[number]) => {
    const r = toStudentRow(s);
    return { userId: r.userId, name: r.name, rollNo: r.rollNo, year: r.year, branch: r.branch, phone: r.phone, openToWork: r.openToWork, lastSeenAt: s.status === "verified" ? (s.lastSeenAt ?? null) : null, aiDone: aiStatusLabel(s.aiStatus).done };
  };
  const refs = eligible.map(toRef);
  // Verified students only, so their email can go on the board for its search (bug sheet 26 Nov); refs above stay without it.
  // ONE pool for the whole page: the board's cards, the summary and the Employers table all read these same rows.
  const pool = await loadDrivePool(drive, verified.map((s) => s.userId), now);
  const { board, view, byEmployer, filter, invited, missing } = await loadDriveBoard(drive, verified.map((s) => ({ ...toRef(s), email: toStudentRow(s).email })), presence ? presence.offline : null, now, open ? sp.employer : null, !open, pool);
  const loadedEmployers = await loadDriveEmployers(drive, pool, invited, open, now);
  // Each company's Shortlisted figure from its own board (the drive's verified students), so the table and the board agree.
  const employers = {
    ...loadedEmployers,
    rows: loadedEmployers.rows.map((r) => (r.employerId && byEmployer[r.employerId] ? { ...r, shortlisted: byEmployer[r.employerId].shortlistCount } : r)),
  };
  // Drive summary: opened from the hero while the drive runs; always shown, under the hero, once it is over (names, read-only).
  const showSummary = !open || sp.view === "summary";
  const summary = showSummary
    ? await loadDriveSummary(drive, verified.map((s) => ({ ...toRef(s), score: s.score, openToWorkAt: s.openToWorkAt })), pool, true)
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
  const e = readEligibility(drive.eligibility);
  const degrees = degreeOptions(rows);
  // Offers by degree and year: counts only, so they stay on a past drive too (a finished drive is read-only).
  const offeredIds = new Set(board.lists.offers.map((s) => s.userId));
  const hiredIds = new Set(board.lists.hired.map((s) => s.userId));
  // The degree is the student's own (B.Tech, BCA…), the same field as the Degree filter; refs carry the branch only.
  const spellings = degreeOptions(eligible);
  const degreeOf = new Map(eligible.map((s) => [s.userId, s.degree?.trim() ? (spellings.find((o) => normDegree(o) === normDegree(s.degree!)) ?? s.degree.trim()) : null]));
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
    degrees: group((r) => degreeOf.get(r.userId) ?? "Degree not set").sort((a, b) => b.offered - a.offered || b.inDrive - a.inDrive).slice(0, 8),
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
      arrivals={pool.came.map((c) => ({ id: c.employerId, company: c.company ?? "Employer", at: c.joinedAt }))}
      missing={open ? missing.map((m) => m.company) : []}
      clickable={!open}
      jump={open}
    />
  );

  const lede = `${DRIVE_KIND_LABEL[drive.kind] ?? drive.kind}${audienceLabel(drive.audience) ? ` · ${audienceLabel(drive.audience)}` : ""} · ${WINDOW_LABEL[w]} · ${fmt(drive.startsAt)} to ${fmt(drive.endsAt)} · ${plural(eligible.length, "student", "students")} in the drive`;

  // A finished drive: one card (its own hero) and the analysis under it; every figure opens its list in a pop-up.
  if (!open && summary) {
    // What the pop-up tables show beyond the board row. Verified students only, like the board; all of it is already loaded above.
    // Strength and who was left out, one reason each, as things stand today (Findtern keeps no history of it).
    const readiness = await readinessForMany(eligible.map((s) => s.userId));
    const reach = driveReach(eligible, readiness);
    const refOf = new Map(eligible.map((s) => [s.userId, s]));
    const reachRows = Object.fromEntries(
      reach.buckets.map((b) => [
        b.id,
        b.ids.map((id) => {
          const st = refOf.get(id)!;
          const r = toRef(st);
          // P3: a student the officer has not verified shows name, year and branch only.
          return { ...r, phone: st.status === "verified" ? r.phone : null, detail: b.id === "unverified" || st.status !== "verified" ? b.label : (readiness.get(id)?.seenWhy || b.label) };
        }),
      ]),
    );
    const lastSeen = Object.fromEntries(verified.map((s) => [s.userId, s.lastSeenAt ? s.lastSeenAt.toISOString() : null]));
    const people = buildPeople({
      students: verified.map((s) => {
        const r = toStudentRow(s);
        return { userId: r.userId, email: r.email, cgpa: r.cgpa, score: r.score };
      }),
      minutes: summary.tracked === "none" ? null : new Map(summary.online.everyone.map((x) => [x.userId, x.minutes])),
      offers: board.facts.offers,
      meets: board.facts.meets,
      hiredIds: board.lists.hired.map((s) => s.userId),
    });
    return (
      <div className="space-y-6">
        <PastDriveCard
          hero={{ title: drive.title, lede }}
          scores={Object.fromEntries(verified.map((s) => [s.userId, s.score ?? null]))}
          reach={reach}
          reachRows={reachRows}
          lastSeen={lastSeen}
          people={people}
          window={{ start: drive.startsAt, end: drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt }}
          board={board}
          byEmployer={byEmployer}
          employers={employers}
          summary={summary}
          finding={finding}
          initialShow={sp.show}
          timeline={timeline}
          spread={spread.degrees.length ? <DriveSpread degrees={spread.degrees} years={spread.years} /> : null}
          activity={<DriveActivityList rows={activity} className="px-5 py-2 sm:px-6" />}
          activityCount={activity.length}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LiveRefresh everyMs={30_000} />
      <CollegeHero
        title={drive.title}
        lede={lede}
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

      {spread.degrees.length > 0 ? (
        <Surface className="p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink-900">Offers by degree and year</h2>
            <p className="nums text-sm text-text-subtle">{plural(board.lists.offers.length, "student", "students")} offered · {board.lists.hired.length} hired</p>
          </div>
          <div className="mt-4">
            <DriveSpread degrees={spread.degrees} years={spread.years} />
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
              initialUrl={shownDriveLink(drive, origin, driveCodeSecret(), now)}
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
              degrees={degrees}
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
                degrees: (e.degrees ?? []).map((g) => degrees.find((o) => normDegree(o) === g) ?? g),
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
