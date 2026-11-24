import { notFound } from "next/navigation";
import { after } from "next/server";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { CircleAlert, FileText, Mail, Phone, PlayCircle, ShieldCheck } from "lucide-react";

import { Panel, PanelBody, PanelHeader } from "@/components/college/panel";
import { NudgeButton } from "@/components/college/nudge-button";
import { EmptyScene, Pill } from "@/components/app/primitives";
import { Initials } from "@/components/college/kit";
import { LinkedinIcon } from "@/components/ui/social-icons";
import { ONLINE_WINDOW_MS } from "@/lib/college/constants";
import { cn } from "@/lib/utils";
import { readinessForMany } from "@/lib/college/student-readiness-db";
import { StudentRemove } from "@/components/college/student-remove";
import { humanizeStatus, proposalStatus } from "@/components/app/status";
import { aiInterviewLinks } from "@/lib/ai-interview-links";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import { effectiveStatus } from "@/lib/college/meetings";
import { cgpaText } from "@/lib/college/master-row";
import { aiStatusLabel, cohortGoal, membershipLabel, yearLabel, ago } from "@/lib/college/labels";
import { auditCollegeView, requireCollegeContext, studentForCollegeAdmin } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";
import { internOfferKey } from "@/lib/intern-offer-view";
import { openOrderProposalIds } from "@/lib/employer-flow";
import { expiryOf } from "@/lib/proposal-expiry";
import { parseOffer } from "@/lib/offer";
import { realEmployerId } from "@/lib/admin/scope";
import { shortDateTime } from "@/lib/format";
import { canOpenArtifacts, tpoProfile } from "@/lib/college/serialize";
import { buttonClass } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** How the student became one of the college's, in the officer's words. */
const HIDDEN_HINT = "Hidden until verified";
const VERIFIED_BY: Record<string, string> = {
  promo: "Verified by your student code",
  roster: "On your roster",
  email_domain: "College email verified",
  college_code: "Joined with your college code",
  drive_code: "Joined with a drive code",
  tpo: "Accepted by your office",
};

const AXES = [
  ["communication", "Communication"],
  ["coding", "Coding"],
  ["aptitude", "Aptitude"],
  ["interview", "Interview"],
] as const;

/** Request time, for the online dot. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

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
  // A claimed student's offers, interviews and drive calls stay hidden until the officer verifies them.
  const verified = student.status === "verified";
  const [[onboarding], [user], proposals, interviews, calls, views, readiness] = await Promise.all([
    // Allowlist: no Aadhaar, PAN, PIN, bank or emergency contact ever reaches this render (P-4). Columns are picked one by one,
    // and extra_data keeps only the keys draftFromRecord, the ratings and aiInterviewLinks read.
    db
      .select({
        city: schema.internOnboarding.city,
        state: schema.internOnboarding.state,
        linkedinUrl: schema.internOnboarding.linkedinUrl,
        skills: schema.internOnboarding.skills,
        experienceJson: schema.internOnboarding.experienceJson,
        locationTypes: schema.internOnboarding.locationTypes,
        preferredLocations: schema.internOnboarding.preferredLocations,
        hasLaptop: schema.internOnboarding.hasLaptop,
        extraData: sql<Record<string, unknown>>`(SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(coalesce(${schema.internOnboarding.extraData}, '{}'::jsonb)) e WHERE e.key IN ('academics', 'languages', 'experiences', 'extracurricular', 'extracurriculars', 'skillsWithRatings', 'college', 'degree', 'graduationYear', 'ratings', 'aiFeedbackLink', 'aiRecordingLink'))`,
      })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, id))
      .limit(1),
    db.select({ phone: schema.users.phoneNumber, cc: schema.users.countryCode }).from(schema.users).where(eq(schema.users.id, id)).limit(1),
    !verified
      ? Promise.resolve([])
      : db
        .select({ p: schema.proposals })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.internId, id), ne(schema.proposals.status, "draft"), realEmployerId(schema.proposals.employerId)))
        .orderBy(desc(schema.proposals.createdAt)),
    !verified
      ? Promise.resolve([])
      : db
        .select({ i: schema.interviews })
        .from(schema.interviews)
        .where(and(eq(schema.interviews.internId, id), realEmployerId(schema.interviews.employerId), inArray(schema.interviews.status, ["scheduled", "completed", "pending", "expired", "missed", "cancelled"])))
        .orderBy(desc(schema.interviews.createdAt)),
    !verified
      ? Promise.resolve([])
      : db
        .select({ m: schema.collegeDriveMeetings, drive: schema.collegeDrives.title })
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
    verified ? readinessForMany([id]).then((m) => m.get(id) ?? null) : Promise.resolve(null),
  ]);
  // Offers with a payment open right now keep their accepted status (an open order freezes expiry, as for the employer).
  const openOrders = new Set<string>();
  for (const employerId of new Set(proposals.filter(({ p }) => p.status === "accepted" && !p.hiredAt).map(({ p }) => p.employerId))) {
    for (const pid of await openOrderProposalIds(getDb(), employerId)) openOrders.add(pid);
  }

  // Calls from ended drives show too: a finished drive's student lists are readable (read-only).
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

  const seen = student.lastSeenAt ?? student.lastActivityAt;
  const online = seen ? requestTime() - seen.getTime() < ONLINE_WINDOW_MS : false;
  // Contact details only through the verified profile: a claimed student stays redacted.
  const phone = profile?.phone ?? null;
  const linkedin = profile?.links.linkedin ?? "";
  const meetings = interviews.length + calls.length;
  const education = profile?.education ? [profile.education.degree, profile.education.branch, profile.education.institution, profile.education.year].filter(Boolean).join(" · ") : "";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
      {/* The breadcrumb leads back to Students (crumbParents). */}

      {/* Who the student is, as one card: the admin candidate page's left column. */}
      <aside className="apple-admin overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white shadow-xs lg:sticky lg:top-24">
        <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
          <span className="relative">
            <Initials seed={id} name={name || student.email} className="size-20 text-2xl" />
            <span
              aria-hidden
              className={cn("absolute bottom-1 right-1 size-3.5 rounded-full ring-2 ring-white", online ? "bg-brand-600" : "bg-ink-300")}
            />
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-ink-900">{name || student.email}</h1>
          <p className="mt-0.5 text-sm text-text-subtle">
            {[yearLabel(student.year), student.branch].filter((v) => v && v !== "—").join(" · ") || "Year not set"}
          </p>
          <div className="mt-3">
            {student.status === "verified" ? (
              <Pill tone="live">
                <ShieldCheck className="size-3.5" aria-hidden />
                {VERIFIED_BY[student.verifiedBy ?? ""] ?? "Verified"}
              </Pill>
            ) : (
              <Pill tone="waiting">{membershipLabel({ status: student.status, onRoster })}</Pill>
            )}
          </div>
          {readiness ? (
            <p className={cn("mt-2 text-xs font-medium", readiness.paused || !readiness.seen ? "text-accent-700" : "text-brand-800")}>
              {readiness.paused ? "Account paused" : !readiness.seen ? "Hidden from employers" : readiness.hireable ? "Visible to employers" : "Visible, can't be hired yet"}
            </p>
          ) : null}
          {verified ? <p className="mt-1 text-xs text-text-subtle">{online ? "Online now" : `Last active ${ago(seen?.toISOString() ?? null)}`}</p> : null}

          <div className="mt-4 flex gap-2">
            {phone ? (
              <a href={`tel:${phone.replace(/\s/g, "")}`} aria-label={`Call ${name}`} className={contactClass}>
                <Phone className="size-4" aria-hidden />
              </a>
            ) : null}
            <a href={`mailto:${student.email}`} aria-label={`Email ${name}`} className={contactClass}>
              <Mail className="size-4" aria-hidden />
            </a>
            {linkedin ? (
              <a href={linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${name} on LinkedIn (opens in a new tab)`} className={contactClass}>
                <LinkedinIcon className="size-4" />
              </a>
            ) : null}
          </div>
        </div>

        <dl className="divide-y divide-ink-100 border-t border-ink-100 text-sm">
          {([
            ["Email", student.email],
            ["Phone", phone ?? ""],
            ["City", profile?.city ?? ""],
            ["Plan", cohortGoal(student.year)],
            ["Education", education],
            ["Languages", profile?.languages.join(", ") ?? ""],
            ["Work mode", profile?.workModes.join(", ") ?? ""],
            ["Prefers", profile?.preferredCities.join(", ") ?? ""],
            ["Laptop", profile ? (profile.hasLaptop === null ? "" : profile.hasLaptop ? "Has a laptop" : "No laptop") : ""],
            ["Marksheet", readiness ? (readiness.marksheet ? "Uploaded" : "Not uploaded") : ""],
            ["Joined", student.joinedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })],
          ] as const).map(([k, v]) =>
            v && v !== "—" ? (
              <div key={k} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 px-5 py-2.5">
                <dt className="text-text-subtle">{k}</dt>
                <dd className="break-words text-ink-900">{v}</dd>
              </div>
            ) : null,
          )}
          {profile && profile.skills.length > 0 ? (
            <div className="px-5 py-3">
              <dt className="text-text-subtle">Skills</dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {profile.skills.map((sk) => (
                  <span key={sk} className="rounded-full border border-ink-200 px-2.5 py-0.5 text-xs text-ink-800">{sk}</span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
        {!profile ? (
          <p className="border-t border-ink-100 px-5 py-3 text-sm text-text-subtle">Full profile shows once the student is verified with your student code.</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-5 py-4">
          {verified && !ai.done ? <NudgeButton kind="interview" userIds={[id]} label="Nudge to take the interview" size="sm" /> : null}
          <StudentRemove userId={id} name={name || student.email} />
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        {readiness && (!readiness.seen || !readiness.hireable) ? (
          <p role="status" className="flex items-start gap-2.5 rounded-apple-xl border border-accent-300/70 bg-accent-100 px-4 py-3 text-sm text-ink-900">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
            <span>
              <span className="font-medium">
                {!readiness.seen ? `Employers can't see ${student.firstName || "this student"} yet.` : `Employers can see ${student.firstName || "this student"} but can't hire yet.`}
              </span>{" "}
              {!readiness.seen ? readiness.seenWhy : readiness.hireWhy}
              {!readiness.seen && !readiness.hireable ? ` ${readiness.hireWhy.replace(/^Profile /, "Profile also ")}` : ""}
            </span>
          </p>
        ) : null}

        {/* The four numbers an officer asks about first; the score is the one filled tile. */}
        <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="At a glance">
          {/* A claimed student's figures are hidden, not zero: never say "not started" or "none" about data the officer may not see. */}
          <Kpi on label="Findtern score" value={ai.done && student.score !== null ? student.score.toFixed(1) : "—"} hint={!verified ? HIDDEN_HINT : ai.done ? "out of 10" : ai.label} />
          <Kpi label="CGPA" value={student.cgpa !== null ? cgpaText(student.cgpa) : "—"} hint={!verified ? HIDDEN_HINT : student.cgpa !== null ? "out of 10" : "Not entered"} />
          <Kpi label="Offers" value={verified ? String(proposals.length) : "—"} hint={!verified ? HIDDEN_HINT : student.offersPending > 0 ? `${student.offersPending} waiting on reply` : student.hired > 0 ? "Hired" : "None waiting"} />
          <Kpi label="Meetings" value={verified ? String(meetings) : "—"} hint={!verified ? HIDDEN_HINT : calls.length > 0 ? `${calls.length} from your drives` : "Interviews, drive meets"} />
        </ul>

        <Panel>
          <PanelHeader
            title="AI interview"
            description={!verified ? "Shown once you verify this student." : ai.done ? "Scored by Findtern's AI interview. The student sees the same report." : `Status: ${ai.label}`}
            action={
              links.feedbackLink || links.recordingLink ? (
                <>
                  {links.feedbackLink ? (
                    <a href={`/api/college/students/${id}/report`} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                      <FileText className="size-4 text-brand-700" aria-hidden /> Open report
                    </a>
                  ) : null}
                  {links.recordingLink ? (
                    <a href={`/api/college/students/${id}/recording`} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
                      <PlayCircle className="size-4 text-brand-700" aria-hidden /> Watch recording
                    </a>
                  ) : null}
                </>
              ) : undefined
            }
          />
          <PanelBody className="space-y-5">
            {ai.done && student.score !== null ? (
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
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
            ) : (
              verified ? (
                <EmptyScene
                  compact
                  title="No AI interview score"
                  body="This student has not taken the AI interview. Employers in drives filter on this score, so a nudge is worth sending."
                  who="You - use the nudge button on the left"
                />
              ) : (
                <EmptyScene compact title="Hidden until verified" body="Scores, offers and meetings of a student you have not verified stay private. Verify the student with your student code to see them." />
              )
            )}
            {links.feedbackLink || links.recordingLink ? (
              <p className="text-xs text-text-subtle">
                Each time someone opens the report or recording, Findtern records who and when. The student can&apos;t view the recording themselves.
              </p>
            ) : null}
            {/* Folded here, and only when there is something to list. */}
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

        {/* One card for what employers have done with this student; a Pill per row for the state. */}
        <Panel>
          <PanelHeader
            title="Offers and meetings"
            description="From employers on Findtern and in your drives."
            action={student.offersPending > 0 ? <NudgeButton kind="offer" userIds={[id]} label="Nudge to reply" /> : undefined}
          />
          {!verified ? (
            <PanelBody>
              <EmptyScene compact title="Hidden until verified" body="Offers and meetings of a student you have not verified stay private." />
            </PanelBody>
          ) : proposals.length + interviews.length + calls.length === 0 ? (
            <PanelBody>
              <EmptyScene
                compact
                title="No offers or meetings"
                body="Offers, interview invitations and drive meets from employers appear here once they reach out to this student."
                next={{ label: "See your drives", href: "/college/drives" }}
              />
            </PanelBody>
          ) : (
            <ul className="divide-y divide-ink-100">
              {proposals.map(({ p }) => {
                const offer = parseOffer(p.offerDetails, p.currency);
                // The intern's own reading: a sent offer past its start day is lapsed, not waiting.
                const key = internOfferKey(p);
                const waiting = key === "sent";
                // Accepted but not paid before the start day (and no payment open): expired, as the intern, the employer and
                // admin read it, before and after the sweep stores it.
                const expiry = expiryOf({ status: p.status, hiredAt: p.hiredAt, offerDetails: p.offerDetails, currency: p.currency, hasOpenOrder: openOrders.has(p.id) });
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">Offer · {offer.roleTitle || "Internship"}</p>
                      <p className="text-sm text-text-subtle">Sent {ago(p.createdAt?.toISOString() ?? null)}</p>
                    </div>
                    <Pill tone={waiting ? "waiting" : "neutral"}>{waiting ? "Waiting for the student's reply" : key === "lapsed" ? proposalStatus(key).label : humanizeStatus(expiry.expired ? "expired" : p.status)}</Pill>
                  </li>
                );
              })}
              {calls.map(({ m, drive }) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">Drive meet · {drive}</p>
                    <p className="text-sm text-text-subtle">
                      {shortDateTime(m.startsAt, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} IST
                    </p>
                  </div>
                  <Pill tone="neutral">{humanizeStatus(effectiveStatus(m, requestTime()))}</Pill>
                </li>
              ))}
              {interviews.map(({ i }) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">Interview · {i.createdAt ? shortDateTime(i.createdAt, { day: "numeric", month: "short" }) : "requested"}</p>
                  </div>
                  <Pill tone="neutral">{interviewLifecycle(i).label === "Waiting on candidate" ? humanizeStatus(i.status) : interviewLifecycle(i).label}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {profile && profile.experience.length > 0 ? (
          <Panel>
            <PanelHeader title="Experience" />
            <ul className="divide-y divide-ink-100">
              {profile.experience.map((e, n) => (
                <li key={n} className="px-5 py-3.5">
                  <p className="font-medium text-ink-900">{[e.role, e.company].filter(Boolean).join(" at ") || "Experience"}</p>
                  <p className="text-sm text-text-subtle">{e.from} – {e.to}</p>
                  {e.description ? <p className="mt-1 line-clamp-3 text-sm text-ink-700">{e.description}</p> : null}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {profile && profile.extracurriculars.length > 0 ? (
          <Panel>
            <PanelHeader title="Extracurriculars" />
            <PanelBody>
              <ul className="flex flex-wrap gap-1.5">
                {profile.extracurriculars.map((e) => (
                  <li key={e} className="rounded-full border border-ink-200 px-2.5 py-0.5 text-sm text-ink-800">{e}</li>
                ))}
              </ul>
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

const contactClass =
  "grid size-10 place-items-center rounded-full border border-ink-200 text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/** One number tile. `on` is the single filled tile, as on the dashboard. */
function Kpi({ label, value, hint, on = false }: { label: string; value: string; hint: string; on?: boolean }) {
  return (
    <li className={cn("rounded-apple-xl border p-4 sm:p-5", on ? "border-brand-800 bg-brand-800 text-white" : "border-ink-200/80 bg-white shadow-xs")}>
      <p className={cn("text-sm font-medium", on ? "text-white" : "text-ink-700")}>{label}</p>
      <p className={cn("nums mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.25rem]", on ? "text-white" : "text-ink-900")}>{value}</p>
      <p className={cn("mt-2 truncate text-xs sm:text-sm", on ? "text-white/85" : "text-text-subtle")}>{hint}</p>
    </li>
  );
}
