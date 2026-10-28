import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { FileText, PlayCircle, ShieldCheck } from "lucide-react";

import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { NudgeButton } from "@/components/college/nudge-button";
import { PageHead, Pill } from "@/components/app/primitives";
import { humanizeStatus } from "@/components/app/status";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { aiStatusLabel, cohortGoal, yearLabel, ago } from "@/lib/college/labels";
import { requireCollegeContext, studentForCollegeAdmin } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";
import { parseOffer } from "@/lib/offer";
import { realEmployerId } from "@/lib/admin/scope";
import { shortDateTime } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const AXES = [
  ["communication", "Communication"],
  ["coding", "Coding"],
  ["aptitude", "Aptitude"],
  ["interview", "Interview"],
] as const;

export default async function CollegeStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCollegeContext();
  const { id } = await params;
  const student = await studentForCollegeAdmin(ctx, id);
  if (!student) notFound();

  const db = getDb();
  const [[onboarding], proposals, interviews, calls, views] = await Promise.all([
    db.select({ extra: schema.internOnboarding.extraData }).from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, id)).limit(1),
    db
      .select({ p: schema.proposals, company: schema.employers.companyName })
      .from(schema.proposals)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
      .where(and(eq(schema.proposals.internId, id), realEmployerId(schema.proposals.employerId)))
      .orderBy(desc(schema.proposals.createdAt)),
    db
      .select({ i: schema.interviews, company: schema.employers.companyName })
      .from(schema.interviews)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.interviews.employerId))
      .where(and(eq(schema.interviews.internId, id), realEmployerId(schema.interviews.employerId), inArray(schema.interviews.status, ["scheduled", "completed", "pending"])))
      .orderBy(desc(schema.interviews.createdAt)),
    db
      .select({ m: schema.collegeDriveMeetings, company: schema.employers.companyName, drive: schema.collegeDrives.title })
      .from(schema.collegeDriveMeetings)
      .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.id, schema.collegeDriveMeetings.driveId))
      .leftJoin(schema.employers, eq(schema.employers.id, schema.collegeDriveMeetings.employerId))
      .where(and(eq(schema.collegeDriveMeetings.userId, id), eq(schema.collegeDrives.collegeId, ctx.college.id)))
      .orderBy(desc(schema.collegeDriveMeetings.createdAt)),
    db
      .select({ action: schema.collegeAuditLog.action, at: schema.collegeAuditLog.createdAt, who: schema.collegeAdmins.name })
      .from(schema.collegeAuditLog)
      .leftJoin(schema.collegeAdmins, eq(schema.collegeAdmins.id, schema.collegeAuditLog.actorId))
      .where(and(eq(schema.collegeAuditLog.subjectUserId, id), eq(schema.collegeAuditLog.collegeId, ctx.college.id)))
      .orderBy(desc(schema.collegeAuditLog.createdAt))
      .limit(5),
  ]);

  const extra = (onboarding?.extra as Record<string, unknown>) ?? {};
  const ratings = (extra.ratings as Record<string, number>) ?? {};
  const links = await aiInterviewLinks(id, extra);
  const ai = aiStatusLabel(student.aiStatus);
  const name = `${student.firstName} ${student.lastName}`.trim();

  return (
    <div className="space-y-6">
      {/* The breadcrumb leads back to Students (crumbParents). */}

      <PageHead
        title={name || student.email}
        lede={
          <>
            <span className="block text-sm">
              {[student.rollNo, yearLabel(student.year), student.branch, cohortGoal(student.year)].filter((v) => v && v !== "—").join(" · ")}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {student.email}
              {student.status === "verified" ? (
                <Pill tone="live">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {student.verifiedBy === "roster" ? "On your roster" : "College email verified"}
                </Pill>
              ) : (
                <Pill tone="waiting">Not on your roster yet</Pill>
              )}
              <span>Last active {ago(student.lastActivityAt?.toISOString() ?? null)}</span>
            </span>
          </>
        }
        action={!ai.done ? <NudgeButton kind="interview" userIds={[id]} label="Nudge to take the interview" /> : null}
      />

        <Panel>
          <PanelHeader
            title="AI interview"
            description={ai.done ? "Scored by Findtern's AI interview. The student sees the same report." : `Status: ${ai.label}`}
          />
          <PanelBody className="space-y-5">
            {ai.done && student.score !== null ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="nums text-4xl font-bold leading-none tracking-[-0.03em] text-ink-900">{student.score.toFixed(1)}</span>
                  <span className="text-sm text-text-subtle">Findtern score / 10</span>
                </p>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {AXES.map(([key, label]) =>
                    typeof ratings[key] === "number" ? (
                      <div key={key}>
                        <dt className="flex justify-between text-sm text-ink-700">
                          {label}
                          <span className="nums font-semibold text-ink-900">{ratings[key].toFixed(1)}</span>
                        </dt>
                        <dd className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                          <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, ratings[key] * 10)}%` }} />
                        </dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </>
            ) : (
              <p className="text-sm text-text-subtle">No score yet. Employers in drives filter on this score, so it&apos;s worth chasing.</p>
            )}

            <div className="flex flex-wrap gap-2">
              {links.feedbackLink ? (
                <a
                  href={`/api/college/students/${id}/report`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  <FileText className="size-4 text-brand-700" aria-hidden /> Open report
                </a>
              ) : null}
              {links.recordingLink ? (
                <a
                  href={`/api/college/students/${id}/recording`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  <PlayCircle className="size-4 text-brand-700" aria-hidden /> Watch recording
                </a>
              ) : null}
            </div>
            {links.feedbackLink || links.recordingLink ? (
              <p className="text-xs text-text-subtle">
                Each time someone opens the report or recording, Findtern records who and when. The student can&apos;t view the recording themselves.
              </p>
            ) : null}
            {/* Folded here, and only when there is something to list: a full
                side card said "Nobody has opened them yet" most of the time. */}
            {views.length > 0 ? (
              <details className="border-t border-ink-100 pt-4">
                <summary className="cursor-pointer text-sm font-medium text-ink-800">
                  Opened by your team <span className="nums text-text-subtle">({views.length})</span>
                </summary>
                <ul className="mt-3 space-y-2 text-sm">
                  {views.map((v, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-ink-800">
                        {v.who ?? "Findtern staff"} · {v.action === "view_recording" ? "recording" : "report"}
                      </span>
                      <span className="shrink-0 text-text-subtle">{ago(v.at.toISOString())}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </PanelBody>
        </Panel>

      {/* One card for what employers have done with this student (two cards
          each said "No … yet"); a Pill per row for the state. */}
      <Panel>
        <PanelHeader
          title="Offers and meetings"
          description="From employers on Findtern and in your drives."
          action={student.offersPending > 0 ? <NudgeButton kind="offer" userIds={[id]} label="Nudge to reply" /> : undefined}
        />
        {proposals.length + interviews.length + calls.length === 0 ? (
          <PanelBody>
            <p className="text-sm text-text-subtle">No offers or meetings yet.</p>
          </PanelBody>
        ) : (
          <ul className="divide-y divide-ink-100">
            {proposals.map(({ p, company }) => {
              const offer = parseOffer(p.offerDetails, p.currency);
              const waiting = p.status === "sent";
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{offer.roleTitle || "Internship"} · offer</p>
                    <p className="text-sm text-text-subtle">
                      {company ?? "Employer"} · sent {ago(p.createdAt?.toISOString() ?? null)}
                    </p>
                  </div>
                  <Pill tone={waiting ? "waiting" : "neutral"}>{waiting ? "Waiting for the student's reply" : humanizeStatus(p.status)}</Pill>
                </li>
              );
            })}
            {calls.map(({ m, company, drive }) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{company ?? "Employer"} · drive call</p>
                  <p className="text-sm text-text-subtle">
                    {drive} · {shortDateTime(m.startsAt, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} IST
                  </p>
                </div>
                <Pill tone="neutral">{humanizeStatus(m.status)}</Pill>
              </li>
            ))}
            {interviews.map(({ i, company }) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{company ?? "Employer"} · interview</p>
                  <p className="text-sm text-text-subtle">Requested {ago(i.createdAt?.toISOString() ?? null)}</p>
                </div>
                <Pill tone="neutral">{humanizeStatus(i.status)}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
