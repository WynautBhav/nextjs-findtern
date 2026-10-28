import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { driveWindow } from "@/lib/college/access";
import { getDb, schema } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { Surface } from "@/components/app/primitives";
import { CollegeMark, DriveStatePill, KIND_LABEL, driveTime, timeLeft } from "@/components/employer/drive-parts";
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

  return (
    <div>
      <PageHeader
        title="Campus drives"
        subtitle="Placement drives you've entered from a college's link. Each one shows only that college's eligible students, while the drive is open."
      />
      {failed ? (
        <Surface className="p-6 text-sm text-danger" role="alert">
          We couldn&apos;t load your drives just now. Refresh the page to try again.
        </Surface>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No drives yet"
          body="Colleges on Findtern share a drive link with the companies they invite. Open that link while signed in and the drive appears here."
          who="The college's placement office sends the link"
        />
      ) : (
        // minmax(0,1fr): a grid track's minimum is its content, and the one-line
        // title counted at full length, so the column grew to 668px on a phone (QA-118).
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {rows.map(({ drive, college }) => {
            const state = driveWindow(drive);
            const left = state === "live" ? timeLeft(drive.endsAt) : null;
            const open = state === "live";
            const body = (
              <div className="flex items-center gap-4 p-4 sm:p-5">
                <CollegeMark name={college.name} logoUrl={college.logoUrl} className="size-11" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DriveStatePill state={state} />
                    <span className="text-xs font-medium text-text-subtle">{KIND_LABEL[drive.kind] ?? "Campus drive"}</span>
                  </div>
                  <p className="mt-1.5 truncate text-base font-semibold text-ink-900">{drive.title}</p>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {college.name}
                    {college.city ? `, ${college.city}` : ""} · {state === "upcoming" ? `opens ${driveTime(drive.startsAt)}` : `closes ${driveTime(drive.endsAt)}`}
                    {left ? ` · ${left}` : ""}
                  </p>
                </div>
                {open ? <ArrowUpRight className="size-5 shrink-0 text-text-subtle" aria-hidden /> : null}
              </div>
            );
            return (
              <li key={drive.id}>
                {open ? (
                  <Link
                    href={`/employer/drives/${drive.id}`}
                    className="apple-spring block rounded-apple-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <Surface className="transition-shadow hover:shadow-md">{body}</Surface>
                  </Link>
                ) : (
                  <Surface className="opacity-80">{body}</Surface>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
