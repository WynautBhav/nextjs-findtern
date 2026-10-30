import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AlertCircle, ArrowLeft, Download, Phone, User } from "lucide-react";

import { DetailRow, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { ScoreScale, STAT_ROW, StatTile } from "@/components/app/tiles";
import { OfferDecision } from "@/components/app/offer-decision";
import { proposalStatus } from "@/components/app/status";
import { ImportantInstructions } from "@/components/intern/offer/important-instructions";
import { declinesUsedBy, modeLabel, offerFacts } from "@/components/intern/offer/offer-facts";
import { ButtonAnchor, ButtonLink, buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { canAccess } from "@/lib/security/guards";
import { getDb, hasDb, schema } from "@/lib/db";
import { loadInternData } from "@/lib/intern-data";
import { formatJoiningDate, shortDate } from "@/lib/format";
import { canDecide, hybridSplit, shiftInIst } from "@/lib/intern-offer-view";
import { toArray } from "@/lib/journey";
import { sanitizeRichText } from "@/lib/richtext";
import { FREE_DECLINES, WEEKLY_SCHEDULES } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Offer",
  robots: { index: false, follow: false },
};

const COMPANY_LOCKED = "Company details are shared once the company completes the payment for your accepted offer.";

function laptopLabel(raw: string): string {
  const v = raw.toLowerCase();
  if (!v) return "Not specified";
  if (v === "company" || v === "yes") return "Provided by the company";
  if (v === "candidate" || v === "own" || v === "no") return "Your own";
  return raw;
}

type Loaded<T> = { ok: boolean; row: T | null };
const load = <T,>(q: Promise<T[]>): Promise<Loaded<T>> =>
  q.then((rows) => ({ ok: true, row: rows[0] ?? null })).catch((err) => {
    console.error("[intern offer] side query failed", err);
    return { ok: false, row: null };
  });

/**
 * One offer, read as an offer letter (legacy FindTern proposal-detail.tsx):
 * the terms on the left, and on the right (first on a phone) the one thing
 * that matters on this screen: the decision, with the money and the joining
 * date next to it. Money is the intern's monthly share only.
 */
export default async function ProposalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const proposal = data.proposals.find((p) => p.id === id);

  // Ownership is checked before anything is read out of the row, so a guessed
  // id returns the same 404 as a missing one.
  if (!proposal || !canAccess(session, proposal.internId) || proposal.status === "draft") notFound();

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = Number(extra.findternScore ?? 0) || 0;
  const facts = offerFacts(proposal, { score, names: data.names });
  const { offer, fullTime } = facts;
  const ft = offer.fullTime;
  const status = proposalStatus(facts.key);
  const open = canDecide(facts.key);

  let project: Loaded<{ projectName: string; skills: string[] | null; scopeOfWork: string | null }> = { ok: true, row: null };
  let employer: Loaded<{
    companySize: string | null;
    primaryContactName: string | null;
    phoneNumber: string;
    countryCode: string;
  }> = { ok: true, row: null };
  if (hasDb()) {
    const db = getDb();
    [project, employer] = await Promise.all([
      proposal.projectId
        ? load(
            db
              .select({ projectName: schema.projects.projectName, skills: schema.projects.skills, scopeOfWork: schema.projects.scopeOfWork })
              .from(schema.projects)
              .where(eq(schema.projects.id, proposal.projectId))
              .limit(1),
          )
        : Promise.resolve({ ok: true, row: null }),
      load(
        db
          .select({
            companySize: schema.employers.companySize,
            primaryContactName: schema.employers.primaryContactName,
            phoneNumber: schema.employers.phoneNumber,
            countryCode: schema.employers.countryCode,
          })
          .from(schema.employers)
          .where(eq(schema.employers.id, proposal.employerId))
          .limit(1),
      ),
    ]);
  }

  const revealed = facts.company !== null;
  const contactPhone = employer.row?.phoneNumber ? `${employer.row.countryCode ?? ""} ${employer.row.phoneNumber}`.trim() : "";
  const timezone = (ft?.timezone || offer.timezone || "Asia/Kolkata").trim();
  const shift = ft
    ? shiftInIst(ft.shiftFrom, ft.shiftTo, timezone, offer.startDate)
    : shiftInIst(offer.shiftFrom, offer.shiftTo, timezone, offer.startDate);
  const split = facts.mode === "hybrid" ? hybridSplit(proposal.offerDetails) : null;
  const rawSchedule = String(((proposal.offerDetails ?? {}) as Record<string, unknown>).weeklySchedule ?? "").trim();

  // Legacy order: project skills, then the skills copied onto the proposal.
  const projectSkills = toArray<string>(project.row?.skills).map((s) => String(s).trim()).filter(Boolean);
  const skills = projectSkills.length > 0 ? projectSkills : toArray<string>(proposal.skills).map((s) => String(s).trim()).filter(Boolean);

  // The ratings the company saw: the snapshot stored on the proposal when it
  // was sent. Older rows without one fall back to the current ratings (with
  // the Findtern Score as "Overall"), and the heading then says so.
  const snapshot = (proposal.aiRatings ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const fromSnapshot = ["communication", "coding", "aptitude", "overall"].some((k) => num(snapshot[k]) !== null);
  const current = (extra.ratings ?? {}) as Record<string, unknown>;
  const rating = (key: string) =>
    fromSnapshot ? num(snapshot[key]) : num(key === "overall" && score > 0 ? score : current[key]);
  const ratingRows: [string, number | null][] = [
    ["Communication", rating("communication")],
    ["Coding", rating("coding")],
    ["Aptitude", rating("aptitude")],
    ["Overall", rating("overall")],
  ];

  const jd = offer.jd;
  const jdHtml = jd && /<[^>]+>/.test(jd) ? sanitizeRichText(jd) : "";
  const scope = (project.row?.scopeOfWork ?? "").trim();
  const joining = formatJoiningDate(offer.startDate);
  const startsOn = offer.startDate && !Number.isNaN(new Date(offer.startDate).getTime()) ? new Date(offer.startDate) : null;
  const durationParts = /^(\d+)\s+(.+)$/.exec(String(facts.duration ?? ""));

  return (
    <div>
      <Link
        href="/intern/proposals"
        className={buttonClass({ variant: "ghost", size: "sm", className: "-ml-3 mb-4 min-h-11 text-ink-600 hover:text-ink-900" })}
      >
        <ArrowLeft className="size-4" aria-hidden />
        All offers
      </Link>

      <PageHead
        title={facts.role}
        lede={
          <>
            {facts.company ?? "Company shared after hire"}
            {project.row?.projectName ? <span className="text-text-subtle"> · {project.row.projectName}</span> : null}
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Pill tone={status.tone}>{status.label}</Pill>
            <Pill tone="neutral">{fullTime ? "Full-time role" : "Internship"}</Pill>
            {facts.edited ? <Pill tone="new">Updated</Pill> : null}
          </div>
        }
      />

      {/* The terms that decide an offer, as key numbers; the money is the brand tile. */}
      <div className={cn(STAT_ROW, "mb-6 lg:mb-8")}>
        {[
          { label: fullTime ? "Annual CTC" : "Monthly stipend", value: facts.amount, unit: facts.per ? facts.per.replace(/^\/\s*/, "/") : undefined },
          // A value and a smaller unit, so a 2-up tile on a phone never clips ("11 Oct" + "2026").
          startsOn
            ? { label: "Joining date", value: shortDate(startsOn, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }), unit: shortDate(startsOn, { year: "numeric", timeZone: "Asia/Kolkata" }) }
            : { label: "Joining date", value: joining },
          fullTime
            ? { label: "Job mode", value: modeLabel(facts.mode) }
            : durationParts
              ? { label: "Duration", value: durationParts[1], unit: durationParts[2] }
              : { label: "Duration", value: facts.duration },
          { label: fullTime ? "Location" : "Work mode", value: fullTime ? facts.location : modeLabel(facts.mode) },
        ].map((s, i) => (
          <StatTile key={s.label} {...s} featured={i === 0} index={i} />
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ── The decision (focal point; first on a phone) ─────────── */}
        <aside className="lg:sticky lg:top-24 lg:order-2">
          <Surface className="p-5 lg:p-6">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
              {open ? "Your decision" : "Where this stands"}
            </h2>

            {facts.edited && open ? (
              <p className="mt-4 rounded-apple-sm bg-info-soft px-4 py-3 text-sm leading-relaxed text-info">
                The company changed this offer after sending it. Read it again before you answer.
              </p>
            ) : null}

            <div className="mt-4">
              {open ? (
                <OfferDecision
                  proposalId={proposal.id}
                  roleTitle={facts.role}
                  company={facts.company ?? "The company"}
                  startDate={offer.startDate}
                  fullTime={fullTime}
                  declinesUsed={declinesUsedBy(data.proposals)}
                  freeDeclines={FREE_DECLINES}
                  guaranteeEnded={typeof extra.guaranteeEndedAt === "string"}
                />
              ) : (
                <div className="space-y-4">
                  <p className="text-pretty text-sm leading-relaxed text-ink-700">{status.detail}</p>
                  {facts.key === "hired" ? (
                    <ButtonLink href="/intern/timesheets" variant="primary" block className="text-sm font-semibold">
                      Log your hours
                    </ButtonLink>
                  ) : null}
                </div>
              )}
            </div>
          </Surface>
        </aside>

        {/* ── The terms ────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          {ft ? (
            <Surface className="p-5 lg:p-6">
              <SectionHead
                title="Job details"
                hint="Shared by the company as part of this full-time offer."
                action={
                  ft.offerLetterUrl || ft.offerLetterKey ? (
                    <ButtonAnchor href={`/api/proposals/${proposal.id}/offer-letter`} target="_blank" rel="noreferrer" variant="outline" size="sm" className="min-h-11">
                      <Download className="size-4" aria-hidden />
                      Offer letter
                      <span className="sr-only"> (opens in a new tab)</span>
                    </ButtonAnchor>
                  ) : null
                }
              />
              <dl className="divide-y divide-ink-200/80">
                {/* Title, mode, location, joining date and CTC are the heading and the tiles above. */}
                <DetailRow label="Shift (IST)" value={shift ?? "Not specified"} />
                <DetailRow label="Company timezone" value={timezone} />
              </dl>
            </Surface>
          ) : (
            <Surface className="p-5 lg:p-6">
              <SectionHead title="Internship details" />
              <dl className="divide-y divide-ink-200/80">
                {/* Joining date, duration and work mode are the tiles above.
                    Rows the company left empty are left out, not "Not specified". */}
                {rawSchedule ? <DetailRow label="Weekly schedule" value={WEEKLY_SCHEDULES[offer.weeklySchedule].label} /> : null}
                {shift ? <DetailRow label="Shift timings (IST)" value={shift} /> : null}
                <DetailRow
                  label="Monthly hours"
                  value={offer.monthlyHours > 0 ? `${offer.monthlyHours} hrs / month` : "About 160 hrs / month"}
                  mono
                />
                <DetailRow label="Paid leave" value={offer.paidLeavesPerMonth > 0 ? `${offer.paidLeavesPerMonth} ${offer.paidLeavesPerMonth === 1 ? "day" : "days"} a month` : "None"} mono />
                {split ? (
                  <DetailRow label="Hybrid schedule" value={`WFO ${split.office} days · WFH ${split.home} days a week`} />
                ) : null}
                <DetailRow label="Location" value={facts.location} />
                <DetailRow label="Laptop" value={laptopLabel(offer.laptop)} />
              </dl>
            </Surface>
          )}

          {/* ── Company ──────────────────────────────────────────── */}
          <Surface className="p-5 lg:p-6">
            <SectionHead title="Company details" hint={facts.company ?? "Hidden until hire"} />
            {!employer.ok ? (
              <p className="flex items-start gap-2 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                We couldn&apos;t load the company details. Refresh to try again.
              </p>
            ) : (
              <>
                <dl className="divide-y divide-ink-200/80">
                  <DetailRow
                    label="Reporting manager"
                    value={revealed && employer.row?.primaryContactName ? employer.row.primaryContactName : <Locked icon="user" />}
                  />
                  <DetailRow label="Contact number" value={revealed && contactPhone ? <span className="nums whitespace-nowrap">{contactPhone}</span> : <Locked icon="phone" />} />
                  <DetailRow label="Company size" value={employer.row?.companySize || "Not shared"} />
                </dl>
                {!revealed ? <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-600">{COMPANY_LOCKED}</p> : null}
              </>
            )}
          </Surface>

          {/* ── Roles & responsibilities ─────────────────────────── */}
          <Surface className="p-5 lg:p-6">
            <SectionHead title="Roles and responsibilities" />
            {!project.ok && !jd ? (
              <p className="flex items-start gap-2 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                We couldn&apos;t load the role description. Refresh to try again.
              </p>
            ) : jdHtml ? (
              <div className="prose-rt break-words text-base leading-relaxed text-ink-700 [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: jdHtml }} />
            ) : jd || scope ? (
              <p className="whitespace-pre-line text-pretty text-base leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{jd || scope}</p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-600">The company did not add a description to this offer.</p>
            )}
          </Surface>

          {!fullTime ? (
            <>
              <Surface className="p-5 lg:p-6">
                <SectionHead title="Required key skills" />
                {skills.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <li key={skill}>
                        <Pill tone="neutral">{skill}</Pill>
                      </li>
                    ))}
                  </ul>
                ) : !project.ok ? (
                  <p className="text-sm text-danger">We couldn&apos;t load the skills. Refresh to try again.</p>
                ) : (
                  <p className="text-sm text-ink-600">No skills highlighted in this offer.</p>
                )}
              </Surface>

              <Surface className="p-5 lg:p-6">
                {/* The snapshot this offer was made on (QA-004 keeps it here). */}
                <SectionHead title={fromSnapshot ? "Your ratings when this was sent" : "Your ratings now"} />
                <ScoreScale rows={ratingRows.map(([label, value]) => ({ label, value }))} />
              </Surface>

              {/* In full while the offer waits on an answer; afterwards folded,
                  not a 1,000px wall above a running internship. */}
              <ImportantInstructions folded={!open} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Locked({ icon }: { icon: "user" | "phone" }) {
  const Icon = icon === "user" ? User : Phone;
  return (
    <span className="inline-flex items-center gap-1.5 text-text-subtle">
      <Icon className="size-3.5" aria-hidden />
      Shared after hire
    </span>
  );
}
