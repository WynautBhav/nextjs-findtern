import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { driveWindow } from "@/lib/college/access";
import { getDb, schema } from "@/lib/db";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, StatList } from "@/components/app/stat";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { CollegeMark, DriveStatePill, KIND_LABEL, driveTime } from "@/components/employer/drive-parts";
import { compareDrives } from "@/lib/college/access";

export const metadata: Metadata = {
  title: "Campus drives",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Drives this company has entered from a college's link. */
export default async function EmployerDrivesPage() {
  const session = await requireRole("employer");
  let rows: {
    drive: typeof schema.collegeDrives.$inferSelect;
    college: typeof schema.colleges.$inferSelect;
    joinedAt: Date;
  }[] = [];
  let failed = false;
  try {
    rows = await getDb()
      .select({ drive: schema.collegeDrives, college: schema.colleges, joinedAt: schema.collegeDriveEmployers.joinedAt })
      .from(schema.collegeDriveEmployers)
      .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.id, schema.collegeDriveEmployers.driveId))
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
      .where(eq(schema.collegeDriveEmployers.employerId, session.uid))
      .orderBy(desc(schema.collegeDrives.endsAt));
    // Live first, then upcoming, then past (QA-013's order, shared).
    rows.sort((a, b) => compareDrives(a.drive, b.drive));
  } catch (err) {
    console.error("[employer/drives]", err);
    failed = true;
  }

  const states = rows.map(({ drive, college }) => (college.isActive ? driveWindow(drive) : "revoked"));
  const liveCount = states.filter((x) => x === "live").length;
  const upcomingCount = states.filter((x) => x === "upcoming").length;
  const closedCount = rows.length - liveCount - upcomingCount;
  const now = requestTime();
  const firstLive = rows.find((_, i) => states[i] === "live");
  const left = firstLive ? remaining(firstLive.drive.endsAt, now) : null;

  return (
    <div>
      <PageHead
        title="Campus drives"
        lede={rows.length === 0 && !failed ? "A drive is a college inviting you to meet its students in a set window." : undefined}
      />
      {failed ? (
        <LoadError what="your drives" retryHref="/employer/drives" email={SITE.adminEmail} />
      ) : rows.length === 0 ? (
        <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <EmptyScene
            title="No drives yet"
            body="You enter a drive from the link a college shares with the companies it invites. Open that link while signed in and the drive appears here."
            next={{ label: "Browse candidates in the meantime", href: "/employer/candidates" }}
            who="The college's placement office sends the link"
          />
          <ol className="divide-y divide-ink-200 border-y border-ink-200 self-start">
            {[
              ["The college shares a drive link", "Their placement office sends it to you."],
              ["You open it while signed in", "It checks the drive is open and adds you."],
              ["The drive opens as a board", "Its students, their scores, a shortlist and quick video calls."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4 py-3">
                <span aria-hidden className="nums font-display text-2xl font-semibold leading-none text-ink-500">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-ink-900">{t}</p>
                  <p className="text-sm text-ink-700">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="space-y-10">
          <Overview
            lead={
              liveCount > 0 && left ? (
                <LeadStat
                  label={liveCount === 1 ? "Drive open now" : `${liveCount} drives open now`}
                  value={
                    <>
                      <RollingNumber value={left.n} />
                      <span className="ml-1.5 font-sans text-lg font-medium tracking-normal text-ink-700">{left.unit} left</span>
                    </>
                  }
                  note={`${firstLive!.drive.title} closes ${driveTime(firstLive!.drive.endsAt)}.`}
                  action={{ label: "Open the drive", href: `/employer/drives/${firstLive!.drive.id}` }}
                  tone="brand"
                />
              ) : (
                <LeadStat
                  label="Nothing open right now"
                  value={upcomingCount > 0 ? <RollingNumber value={upcomingCount} /> : "0"}
                  note={upcomingCount > 0 ? `${upcomingCount === 1 ? "A drive opens" : "Drives open"} soon. Come back at the opening time.` : "Past drives are listed below. A new one appears when a college invites you."}
                />
              )
            }
            rest={
              <StatList
                items={[
                  ...(liveCount > 0 && upcomingCount > 0 ? [{ label: "Opening soon", value: upcomingCount }] : []),
                  ...(closedCount > 0 ? [{ label: "Ended or closed", value: closedCount }] : []),
                  { label: "All drives", value: rows.length },
                ]}
              />
            }
          />
          <ul className="border-t border-ink-300">
            {rows.map(({ drive, college }, i) => {
              // A switched-off college's drives read as closed, as the drive itself refuses (QA-201).
              const state = states[i];
              const open = state === "live";
              const mark = markOf(drive, state, now);
              return (
                <li key={drive.id} className="relative grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-5 border-b border-ink-200 py-5 transition-colors duration-[var(--motion-fast)] sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
                  <p className="text-sm text-ink-700">
                    <span aria-hidden className={`nums block font-display text-4xl font-semibold leading-none tracking-[-0.03em] ${open ? "text-brand-700" : state === "upcoming" ? "text-ink-900" : "text-ink-500"}`}>{mark.big}</span>
                    <span aria-hidden className="mt-1.5 block">{mark.small}</span>
                  </p>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {open ? (
                        <h2 className="break-words font-display text-lg font-semibold text-ink-900">
                          <Link href={`/employer/drives/${drive.id}`} className="outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-700">
                            {drive.title}
                          </Link>
                        </h2>
                      ) : (
                        <h2 className="break-words font-display text-lg font-semibold text-ink-900">{drive.title}</h2>
                      )}
                      <DriveStatePill state={state} />
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-700">
                      <CollegeMark name={college.name} logoUrl={college.logoUrl} className="size-6 rounded-md text-xs" />
                      <span className="min-w-0">
                        {college.name}
                        {college.city ? `, ${college.city}` : ""}
                        <span className="text-ink-600"> · {KIND_LABEL[drive.kind] ?? "Campus drive"}</span>
                      </span>
                    </p>
                    <p className="nums mt-1 text-sm text-ink-700">
                      {state === "upcoming" ? `Opens ${driveTime(drive.startsAt)}` : state === "live" ? `Closes ${driveTime(drive.endsAt)}` : `Closed ${driveTime(drive.endsAt)}`}
                    </p>
                  </div>
                  {open ? <ArrowUpRight className="size-5 shrink-0 text-brand-700 max-sm:hidden" aria-hidden /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The request's clock, read once so every row is measured against the same instant. */
function requestTime(): number {
  return Date.now();
}

/** Days (or hours, or minutes) left in a live window, as a number and a unit. */
function remaining(endsAt: Date, now: number): { n: number; unit: string } {
  const ms = Math.max(0, endsAt.getTime() - now);
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return { n: Math.floor(hours / 24), unit: "days" };
  if (hours >= 1) return { n: hours, unit: hours === 1 ? "hour" : "hours" };
  return { n: Math.max(1, Math.floor(ms / 60_000)), unit: "min" };
}

/** The big mark beside a drive: time left if live, the opening day if upcoming, the closing day if over. */
function markOf(drive: { startsAt: Date; endsAt: Date }, state: string, now: number): { big: string; small: string } {
  const day = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).formatToParts(d);
  const part = (d: Date, t: string) => day(d).find((x) => x.type === t)?.value ?? "";
  if (state === "live") {
    const r = remaining(drive.endsAt, now);
    return { big: String(r.n), small: `${r.unit} left` };
  }
  const d = state === "upcoming" ? drive.startsAt : drive.endsAt;
  return { big: part(d, "day"), small: `${state === "upcoming" ? "Opens " : "Ended "}${part(d, "month")}` };
}
