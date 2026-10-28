import { notFound } from "next/navigation";

import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { PageHead } from "@/components/app/primitives";
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
import { toStudentRow } from "@/lib/college/serialize";

export const dynamic = "force-dynamic";

export default async function DrivePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCollegeContext();
  const { id } = await params;
  const drive = await driveForCollegeAdmin(ctx, id);
  if (!drive) notFound();

  const w = driveWindow(drive);
  const [students, eligible, employers] = await Promise.all([
    studentsForCollegeAdmin(ctx),
    eligibleStudents(drive),
    driveEmployers(drive.id),
  ]);
  const presence = w === "live" ? await presenceSnapshot(ctx.college.id, eligible.map((s) => s.userId)) : null;
  const rows = students.map(toStudentRow);
  const branches = [...new Set(rows.map((s) => s.branch).filter((b): b is string => Boolean(b)))].sort();
  const e = readEligibility(drive.eligibility);

  return (
    <div className="space-y-6">
      <PageHead
        title={drive.title}
        lede={`${DRIVE_KIND_LABEL[drive.kind] ?? drive.kind} · ${WINDOW_LABEL[w]} · ${eligible.length} ${eligible.length === 1 ? "student" : "students"} visible to employers`}
      />

      {presence ? (
        <PresenceLive driveId={drive.id} driveTitle={drive.title} showTitle={false} endsAt={drive.endsAt.toISOString()} initial={presence} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Link"
            description={
              w === "revoked"
                ? "Closed. No employer can get in."
                : `Active · ${employers.length} ${employers.length === 1 ? "company has" : "companies have"} joined. Companies must sign in to Findtern.`
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
        <Panel>
          <PanelHeader title="Employers inside" description="Companies that opened your link while signed in." />
          {employers.length === 0 ? (
            <PanelBody>
              <p className="text-sm text-text-subtle">Nobody yet. Once you share the link, companies appear here as they join.</p>
            </PanelBody>
          ) : (
            <ul className="divide-y divide-ink-100">
              {employers.map((em) => (
                <li key={em.employerId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="font-medium text-ink-900">{em.company ?? "Employer"}</span>
                  <span className="nums text-sm text-text-subtle">
                    {em.shortlisted} shortlisted · {em.calls} call{em.calls === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Folded: the page is about the drive running, and editing is the
          rare case (it was 2,500px open under everything). Gone once the
          drive is over or its link is closed. */}
      {w === "ended" || w === "revoked" ? null : (
      <details className="group rounded-apple-xl border border-ink-200/80 bg-white shadow-xs">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-sm font-semibold text-ink-900 hover:bg-ink-50">
          Edit dates and eligibility
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
        }}
      />
        </div>
      </details>
      )}
    </div>
  );
}
