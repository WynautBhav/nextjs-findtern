import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { driveWindow } from "@/lib/college/access";
import { toView } from "@/lib/college/meetings";
import { ONLINE_WINDOW_MS, driveForEmployer, eligibleStudents } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";
import { displayNameOf, initialsOf, readSkills } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { EmptyState } from "@/components/layout/page-header";
import { CoBrand, CollegeMark, DriveStatePill, KIND_LABEL, driveTime, timeLeft } from "@/components/employer/drive-parts";
import { DriveWorkspace, type DriveCandidate } from "@/components/employer/drive-workspace";

export const metadata: Metadata = {
  title: "Campus drive",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DENIED: Record<string, { title: string; body: string }> = {
  ended: { title: "This drive has ended", body: "The college's drive window is over, so its students are no longer shown here. Candidates you met can still be found on Findtern." },
  revoked: { title: "The college closed this drive", body: "The placement office has switched off this drive's link. Ask them for a new one if you were expecting to continue." },
  not_started: { title: "This drive hasn't opened yet", body: "Come back at the opening time. Nothing to do until then." },
  not_joined: { title: "Open the college's link first", body: "You enter a drive from the link the college shared with you. Open it while signed in and you'll land back here." },
};

/**
 * The drive workspace. Only this college's eligible students, only while the
 * drive is open, only for an employer who entered from the link: all three
 * are re-checked on every load and every action (src/lib/college/access.ts).
 */
/** Request time for the "online now" dots (dynamic page: per request). */
function requestTime(): number {
  return Date.now();
}

export default async function EmployerDrivePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("employer");
  const { id } = await params;
  const loaded = await driveForEmployer(id, session);
  if (!loaded) notFound();
  const { drive, college, access } = loaded;
  const state = driveWindow(drive);
  const fullTime = drive.kind === "full_time";

  const header = (
    <header className="mb-7">
      <CoBrand collegeName={college.name} />
      <div className="mt-3 flex items-start gap-4">
        <CollegeMark name={college.name} logoUrl={college.logoUrl} className="hidden sm:grid" />
        <div className="min-w-0 flex-1">
          <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900 md:text-3xl">{drive.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-600">
            <DriveStatePill state={state} />
            <span>{KIND_LABEL[drive.kind] ?? "Campus drive"}</span>
            <span aria-hidden className="text-ink-300">·</span>
            <span className="nums">
              Closes {driveTime(drive.endsAt)}
              {state === "live" && timeLeft(drive.endsAt) ? ` (${timeLeft(drive.endsAt)})` : ""}
            </span>
          </div>
        </div>
      </div>
    </header>
  );

  if (!access.ok) {
    const copy = DENIED[access.reason] ?? DENIED.not_joined;
    return (
      <div>
        {header}
        <EmptyState title={copy.title} body={copy.body} action={{ label: "All campus drives", href: "/employer/drives" }} />
      </div>
    );
  }

  const db = getDb();
  const students = await eligibleStudents(drive);
  const ids = students.map((s) => s.userId);
  const [onboarding, shortlist, meetings, hired] = await Promise.all([
    ids.length
      ? db
          .select({ userId: schema.internOnboarding.userId, skills: schema.internOnboarding.skills })
          .from(schema.internOnboarding)
          .where(inArray(schema.internOnboarding.userId, ids))
      : Promise.resolve([]),
    db
      .select({ userId: schema.collegeDriveShortlist.userId })
      .from(schema.collegeDriveShortlist)
      .where(and(eq(schema.collegeDriveShortlist.driveId, drive.id), eq(schema.collegeDriveShortlist.employerId, session.uid))),
    db
      .select()
      .from(schema.collegeDriveMeetings)
      .where(and(eq(schema.collegeDriveMeetings.driveId, drive.id), eq(schema.collegeDriveMeetings.employerId, session.uid)))
      .orderBy(desc(schema.collegeDriveMeetings.createdAt)),
    hiredInternIds(db, session.uid),
  ]);
  const skillsOf = new Map(onboarding.map((o) => [o.userId, readSkills(o.skills).map((s) => s.split(" · ")[0])]));
  const shortlisted = new Set(shortlist.map((s) => s.userId));

  // Only what the card shows crosses to the browser: no email, no full name
  // before hire, no CGPA on internship drives.
  const now = requestTime();
  const candidates: DriveCandidate[] = students.map((s) => {
    const initials = initialsOf(s.firstName, s.lastName);
    return {
      id: s.userId,
      name: displayNameOf({ fullName: `${s.firstName} ${s.lastName}`.trim(), initials }, hired.has(s.userId)),
      initials,
      year: s.year,
      branch: s.branch,
      cgpa: fullTime ? s.cgpa : null,
      score: s.score,
      skills: skillsOf.get(s.userId) ?? [],
      shortlisted: shortlisted.has(s.userId),
      online: Boolean(s.lastSeenAt && now - s.lastSeenAt.getTime() < ONLINE_WINDOW_MS),
    };
  });

  return (
    <div>
      {header}
      <DriveWorkspace
        driveId={drive.id}
        fullTime={fullTime}
        candidates={candidates}
        initialMeetings={meetings.map(toView)}
      />
    </div>
  );
}
