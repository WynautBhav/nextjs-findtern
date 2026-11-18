import { notFound } from "next/navigation";

import { PageHead } from "@/components/app/primitives";
import { Section } from "@/components/app/stat";
import { DriveBuilder } from "@/components/college/drive-builder";
import { toLocalInput } from "@/lib/college/ist";
import { LinkActions } from "@/components/college/link-actions";
import { PresenceLive } from "@/components/college/presence-live";
import { driveWindow, readEligibility } from "@/lib/college/access";
import { driveEmployers } from "@/lib/college/drives";
import { DRIVE_KIND_LABEL, WINDOW_LABEL } from "@/lib/college/labels";
import {
  driveForCollegeAdmin,
  eligibleStudents,
  presenceSnapshot,
  requireCollegeContext,
  studentsForCollegeAdmin,
} from "@/lib/college/scope";
import { driveDataOpen, toStudentRow } from "@/lib/college/serialize";

export const dynamic = "force-dynamic";

export default async function DrivePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCollegeContext();
  const { id } = await params;
  const drive = await driveForCollegeAdmin(ctx, id);
  if (!drive) notFound();

  const w = driveWindow(drive);
  // Once over, the TPO keeps counts, not the student lists (C12).
  const [students, eligible, employers] = await Promise.all([
    driveDataOpen(drive) ? studentsForCollegeAdmin(ctx) : Promise.resolve([]),
    eligibleStudents(drive),
    driveEmployers(drive.id),
  ]);
  const presence = w === "live" ? await presenceSnapshot(ctx.college.id, eligible.map((s) => s.userId)) : null;
  const rows = students.map(toStudentRow);
  const branches = [...new Set(rows.map((s) => s.branch).filter((b): b is string => Boolean(b)))].sort();
  const e = readEligibility(drive.eligibility);
  const joined = `${employers.length} ${employers.length === 1 ? "company" : "companies"}`;

  return (
    <div className="space-y-8">
      <PageHead
        title={drive.title}
        lede={`${DRIVE_KIND_LABEL[drive.kind] ?? drive.kind} · ${WINDOW_LABEL[w]} · ${eligible.length} ${eligible.length === 1 ? "student" : "students"} visible to employers`}
      />

      {presence ? (
        <PresenceLive driveId={drive.id} driveTitle={drive.title} showTitle={false} endsAt={drive.endsAt.toISOString()} initial={presence} />
      ) : null}

      <div className="grid gap-x-14 gap-y-8 lg:grid-cols-2">
        <Section
          title="Drive link"
          hint={
            w === "revoked"
              ? "Closed. No employer can get in."
              : w === "ended"
                ? `Ended · ${joined} joined.`
                : `${joined} ${employers.length === 1 ? "has" : "have"} joined. Companies must sign in to Findtern.`
          }
        >
          <LinkActions
            driveId={drive.id}
            revoked={w === "revoked"}
            collegeName={ctx.college.name}
            driveTitle={drive.title}
            startsAt={drive.startsAt.toISOString()}
            endsAt={drive.endsAt.toISOString()}
            kind={drive.kind}
          />
        </Section>
        <Section title="Employers inside" hint="Companies that opened your link while signed in.">
          {employers.length === 0 ? (
            <p className="max-w-sm text-sm text-ink-700">Nobody yet. Once you share the link, companies appear here as they join.</p>
          ) : (
            <ul className="divide-y divide-ink-200 border-y border-ink-200">
              {employers.map((em) => (
                <li key={em.employerId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <span className="font-medium text-ink-900">{em.company ?? "Employer"}</span>
                  <span className="nums text-sm text-ink-700">
                    {em.shortlisted} shortlisted · {em.calls} call{em.calls === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Folded: the page is about the drive running, and editing is the
          rare case. Gone once the drive is over or its link is closed. */}
      {w === "ended" || w === "revoked" ? null : (
        <details className="group border-y border-ink-200">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-display text-lg font-semibold text-ink-900">
            Edit dates and eligibility
            <span aria-hidden className="text-sm font-medium text-brand-800 group-open:hidden">Open</span>
          </summary>
          <div className="pb-6 pt-2">
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
              }}
            />
          </div>
        </details>
      )}
    </div>
  );
}
