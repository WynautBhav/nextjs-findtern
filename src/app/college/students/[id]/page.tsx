import { notFound } from "next/navigation";
import { after } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { FileText, PlayCircle, ShieldCheck } from "lucide-react";

import { Meter } from "@/components/college/meter";
import { LeadStat, Section } from "@/components/app/stat";
import { NudgeButton } from "@/components/college/nudge-button";
import { EmptyScene, PageHead, Pill } from "@/components/app/primitives";
import { humanizeStatus } from "@/components/app/status";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { aiStatusLabel, cohortGoal, membershipLabel, yearLabel, ago } from "@/lib/college/labels";
import { auditCollegeView, requireCollegeContext, studentForCollegeAdmin } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";
import { parseOffer } from "@/lib/offer";
import { realEmployerId } from "@/lib/admin/scope";
import { shortDateTime } from "@/lib/format";
import { canOpenArtifacts, driveDataOpen, tpoProfile } from "@/lib/college/serialize";
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
  const [onRosterRow] = await db
    .select({ email: schema.collegeRoster.email })
    .from(schema.collegeRoster)
    .where(and(eq(schema.collegeRoster.collegeId, ctx.college.id), eq(schema.collegeRoster.email, student.email.trim().toLowerCase())))
    .limit(1);
  const onRoster = Boolean(onRosterRow);
  const [[onboarding], [user], proposals, interviews, allCalls, views] = await Promise.all([
    // Allowlist: no Aadhaar, PAN, PIN, bank or emergency contact ever reaches this render (P-4). Columns are picked one by one,
    // and extra_data keeps only the keys draftFromRecord, the ratings and aiInterviewLinks read.
    db
      .select({
        city: schema.internOnboarding.city,
        state: schema.internOnboarding.state,
        linkedinUrl: schema.internOnboarding.linkedinUrl,
        skills: schema.internOnboarding.skills,
        experienceJson: schema.internOnboarding.experienceJson,
        extraData: sql<Record<string, unknown>>`(SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(coalesce(${schema.internOnboarding.extraData}, '{}'::jsonb)) e WHERE e.key IN ('academics', 'languages', 'experiences', 'extracurricular', 'extracurriculars', 'skillsWithRatings', 'college', 'degree', 'graduationYear', 'ratings', 'aiFeedbackLink', 'aiRecordingLink'))`,
      })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, id))
      .limit(1),
    db.select({ phone: schema.users.phoneNumber, cc: schema.users.countryCode }).from(schema.users).where(eq(schema.users.id, id)).limit(1),
    db
      .select({ p: schema.proposals })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.internId, id), realEmployerId(schema.proposals.employerId)))
      .orderBy(desc(schema.proposals.createdAt)),
    db
      .select({ i: schema.interviews })
      .from(schema.interviews)
      .where(and(eq(schema.interviews.internId, id), realEmployerId(schema.interviews.employerId), inArray(schema.interviews.status, ["scheduled", "completed", "pending"])))
      .orderBy(desc(schema.interviews.createdAt)),
    db
      .select({ m: schema.collegeDriveMeetings, drive: schema.collegeDrives.title, d: schema.collegeDrives })
      .from(schema.collegeDriveMeetings)
      .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.id, schema.collegeDriveMeetings.driveId))
      .where(and(eq(schema.collegeDriveMeetings.userId, id), eq(schema.collegeDrives.collegeId, ctx.college.id)))
      .orderBy(desc(schema.collegeDriveMeetings.createdAt)),
    db
      .select({ action: schema.collegeAuditLog.action, at: schema.collegeAuditLog.createdAt, who: schema.collegeAdmins.name })
      .from(schema.collegeAuditLog)
      .leftJoin(schema.collegeAdmins, eq(schema.collegeAdmins.id, schema.collegeAuditLog.actorId))
      .where(and(eq(schema.collegeAuditLog.subjectUserId, id), eq(schema.collegeAuditLog.collegeId, ctx.college.id), inArray(schema.collegeAuditLog.action, ["view_report", "view_recording"])))
      .orderBy(desc(schema.collegeAuditLog.createdAt))
      .limit(5),
  ]);

  // An ended or revoked drive no longer shows its calls (C12).
  const calls = allCalls.filter((c) => driveDataOpen(c.d));
  const profile = tpoProfile(student.status, onboarding, user ? `${user.cc} ${user.phone}` : null);
  // One audit row per full-profile view, written after the response so it never blocks the page.
  if (profile) {
    after(() =>
      auditCollegeView({ collegeId: ctx.college.id, actorType: "college_admin", actorId: ctx.admin.id }, "view_profile", id).catch((err) =>
        console.error("[college-audit] view_profile", err),
      ),
    );
  }
  const artifacts = canOpenArtifacts(student.status);
  const extra = (onboarding?.extraData as Record<string, unknown>) ?? {};
  const ratings = (extra.ratings as Record<string, number>) ?? {};
  const links = artifacts ? await aiInterviewLinks(id, extra) : { feedbackLink: null, recordingLink: null };
  const ai = aiStatusLabel(student.aiStatus);
  const name = `${student.firstName} ${student.lastName}`.trim();

  const facts = profile
    ? ([
        ["Phone", profile.phone],
        ["City", profile.city],
        ["Skills", profile.skills.join(", ")],
        ["Languages", profile.languages.join(", ")],
        ["Education", profile.education ? [profile.education.degree, profile.education.branch, profile.education.institution, profile.education.year].filter(Boolean).join(" · ") : ""],
        ["LinkedIn", profile.links.linkedin],
      ] as const)
    : [];
  const when = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const rowCls = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3";

  return (
    <div className="space-y-8">
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
                  {student.verifiedBy === "promo" ? "Verified by your student code" : student.verifiedBy === "roster" ? "On your roster" : "College email verified"}
                </Pill>
              ) : (
                <Pill tone="waiting">{membershipLabel({ status: student.status, onRoster })}</Pill>
              )}
              <span>Last active {ago(student.lastActivityAt?.toISOString() ?? null)}</span>
            </span>
          </>
        }
        action={!ai.done ? <NudgeButton kind="interview" userIds={[id]} label="Nudge to take the interview" /> : null}
      />

      <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Section title="AI interview" hint={ai.done ? "Scored by Findtern's AI interview. The student sees the same report." : `Status: ${ai.label}`}>
          {ai.done && student.score !== null ? (
            <div className="space-y-5">
              <LeadStat label="Findtern score" value={<>{student.score.toFixed(1)}<span className="text-2xl text-ink-600"> / 10</span></>} />
              <dl className="space-y-3">
                {AXES.map(([key, label]) =>
                  typeof ratings[key] === "number" ? (
                    <div key={key}>
                      <dt className="flex justify-between text-sm text-ink-700">
                        {label}
                        <span className="nums font-semibold text-ink-900">{ratings[key].toFixed(1)}</span>
                      </dt>
                      <dd className="mt-1.5">
                        <Meter value={ratings[key]} max={10} label={`${label} score`} className="h-2" />
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </div>
          ) : (
            <EmptyScene
              compact
              title="No AI interview score"
              body="This student has not taken the AI interview. Employers in drives filter on this score, so a nudge is worth sending."
              who="You - use the nudge button above"
            />
          )}
          {links.feedbackLink || links.recordingLink ? (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap gap-2">
                {links.feedbackLink ? (
                  <a href={`/api/college/students/${id}/report`} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                    <FileText className="size-4" aria-hidden /> Open report
                  </a>
                ) : null}
                {links.recordingLink ? (
                  <a href={`/api/college/students/${id}/recording`} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                    <PlayCircle className="size-4" aria-hidden /> Watch recording
                  </a>
                ) : null}
              </div>
              <p className="text-xs text-ink-600">
                Each time someone opens the report or recording, Findtern records who and when. The student can&apos;t view the recording themselves.
              </p>
            </div>
          ) : null}
          {views.length > 0 ? (
            <details className="mt-4 border-t border-ink-200 pt-2">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-ink-800">
                Opened by your team <span className="nums text-ink-600">({views.length})</span>
              </summary>
              <ul className="space-y-2 pb-1 text-sm">
                {views.map((v, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-ink-800">
                      {v.who ?? "Findtern staff"} · {v.action === "view_recording" ? "recording" : "report"}
                    </span>
                    <span className="shrink-0 text-ink-600">{ago(v.at.toISOString())}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Section>

        <div className="min-w-0 space-y-8">
          <Section title="Profile" hint={profile ? "Shown because this student is verified with your college." : undefined}>
            {profile ? (
              <dl className="divide-y divide-ink-200 border-y border-ink-200 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k} className="grid gap-x-6 gap-y-0.5 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <dt className="text-ink-600">{k}</dt>
                    <dd className="break-words text-ink-900">{v || "—"}</dd>
                  </div>
                ))}
                {profile.experience.length > 0 ? (
                  <div className="grid gap-x-6 gap-y-0.5 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <dt className="text-ink-600">Experience</dt>
                    <dd className="space-y-1 text-ink-900">
                      {profile.experience.map((e, n) => (
                        <p key={n}>{[e.role, e.company].filter(Boolean).join(" at ")} <span className="text-ink-600">{e.from} – {e.to}</span></p>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="max-w-md text-sm text-ink-700">Full profile shows once the student is verified with your student code.</p>
            )}
          </Section>

          <Section
            title="Offers and meetings"
            hint="From employers on Findtern and in your drives."
            action={student.offersPending > 0 ? <NudgeButton kind="offer" userIds={[id]} label="Nudge to reply" /> : undefined}
          >
            {proposals.length + interviews.length + calls.length === 0 ? (
              <EmptyScene
                compact
                title="No offers or meetings"
                body="Offers, interview invitations and drive calls from employers appear here once they reach out to this student."
                next={{ label: "See your drives", href: "/college/drives" }}
              />
            ) : (
              <ul className="divide-y divide-ink-200 border-y border-ink-200">
                {proposals.map(({ p }) => {
                  const offer = parseOffer(p.offerDetails, p.currency);
                  const waiting = p.status === "sent";
                  return (
                    <li key={p.id} className={rowCls}>
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">Offer · {offer.roleTitle || "Internship"}</p>
                        <p className="text-sm text-ink-600">Sent {ago(p.createdAt?.toISOString() ?? null)}</p>
                      </div>
                      <Pill tone={waiting ? "waiting" : "neutral"}>{waiting ? "Waiting for the student's reply" : humanizeStatus(p.status)}</Pill>
                    </li>
                  );
                })}
                {calls.map(({ m, drive }) => (
                  <li key={m.id} className={rowCls}>
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">Drive call · {drive}</p>
                      <p className="text-sm text-ink-600">{when(m.startsAt)} IST</p>
                    </div>
                    <Pill tone="neutral">{humanizeStatus(m.status)}</Pill>
                  </li>
                ))}
                {interviews.map(({ i }) => (
                  <li key={i.id} className={rowCls}>
                    <p className="font-medium text-ink-900">Interview · {i.createdAt ? shortDateTime(i.createdAt, { day: "numeric", month: "short" }) : "requested"}</p>
                    <Pill tone="neutral">{humanizeStatus(i.status)}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
