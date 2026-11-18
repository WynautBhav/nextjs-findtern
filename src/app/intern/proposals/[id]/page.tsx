import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AlertCircle, ArrowLeft, Download, Info, Phone, User } from "lucide-react";

import { DetailRow, PageHead, Pill } from "@/components/app/primitives";
import { LeadStat, Overview, StatList } from "@/components/app/stat";
import { ScoreScale } from "@/components/app/tiles";
import { DecisionPanel } from "@/components/intern/offer/decision-panel";
import { proposalStatus } from "@/components/app/status";
import { ImportantInstructions } from "@/components/intern/offer/important-instructions";
import { modeLabel, offerFacts } from "@/components/intern/offer/offer-facts";
import { ButtonAnchor, ButtonLink, buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { getDb, hasDb, schema } from "@/lib/db";
import { scopeValue } from "@/lib/db/schema";
import { loadInternData } from "@/lib/intern-data";
import { rawScore } from "@/lib/employer-candidates";
import { offerBonusMinor } from "@/lib/completion-bonus";
import { formatDate, formatMoney } from "@/lib/format";
import { canDecide, hybridSplit, internOfferOverlay, offerJoiningDay, shiftInIst } from "@/lib/intern-offer-view";
import { toArray } from "@/lib/journey";
import { sanitizeRichText } from "@/lib/richtext";
import { guaranteeEnded, guaranteeMisses } from "@/lib/guarantee";
import { FREE_DECLINES, WEEKLY_SCHEDULES } from "@/lib/offer";
import { takedownBlock } from "@/lib/projects/takedown";

export const metadata: Metadata = {
  title: "Offer",
  robots: { index: false, follow: false },
};

const COMPANY_LOCKED = "Company details are shared once the company completes the payment for your accepted offer.";

function laptopLabel(raw: string): string {
  const v = raw.toLowerCase();
  if (!v) return "Not specified";
  if (v === "company" || v === "yes") return "Provided by the company";
  if (v === "candidate" || v === "intern" || v === "own" || v === "no") return "Your own";
  // Never echo an unknown value: it is free text from the employer.
  return "Not specified";
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
  const misses = guaranteeMisses(data.proposals);
  const facts = offerFacts(proposal, { score, names: data.names });
  const { offer, fullTime } = facts;
  const ft = offer.fullTime;
  const overlay = internOfferOverlay(proposal, extra);
  // The CGPA check and an expired offer read differently from the stored status (intern-offer-view.ts).
  const status = overlay.kind ? { label: overlay.label, tone: overlay.tone, detail: overlay.detail } : proposalStatus(facts.key);
  const open = canDecide(facts.key);
  // A bonus already scheduled for this offer (it ran on the score before completion) beats today's score.
  let scheduledMinor: number | null = null;
  if (hasDb()) {
    const [row] = await getDb()
      .select({ amountMinor: schema.internPayouts.amountMinor })
      .from(schema.internPayouts)
      .where(and(eq(schema.internPayouts.bonusProposalId, proposal.id), eq(schema.internPayouts.kind, "completion_bonus"), eq(schema.internPayouts.internId, proposal.internId)))
      .limit(1)
      .catch(() => []);
    scheduledMinor = row?.amountMinor ?? null;
  }
  const bonusMinor = offerBonusMinor(rawScore(extra), { fullTime, scheduledMinor });
  const bonusLabel = bonusMinor
    ? `+ ${formatMoney(bonusMinor, "INR", { zeroLabel: false })} completion bonus ${scheduledMinor ? "scheduled" : "when you finish"}`
    : null;

  let project: Loaded<{ projectName: string; skills: string[] | null; scopeOfWork: string | null; takenDownAt: Date | null }> = { ok: true, row: null };
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
              .select({ projectName: schema.projects.projectName, skills: schema.projects.skills, scopeOfWork: schema.projects.scopeOfWork, takenDownAt: schema.projects.takenDownAt })
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
  // scopeOfWork is a duration pick ("short-term", "not-sure"), not role text; only free text from a legacy row is shown.
  const rawScope = (project.row?.scopeOfWork ?? "").trim();
  const scope = scopeValue(rawScope) || /^not[-_ ]?sure$/i.test(rawScope) ? "" : rawScope;
  // One joining date for the whole page: the IST day the first shift starts (can differ from the employer's calendar day).
  const joiningDay = offerJoiningDay(offer);
  const joining = joiningDay ? formatDate(joiningDay) : "To be agreed";

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
            {takedownBlock(project.row, "accept") && ["sent", "interview_scheduled", "accepted"].includes(facts.key) ? <Pill tone="neutral">On hold</Pill> : <Pill tone={status.tone}>{status.label}</Pill>}
            <Pill tone="neutral">{fullTime ? "Full-time role" : "Internship"}</Pill>
            {facts.edited ? <Pill tone="new">Updated</Pill> : null}
          </div>
        }
      />

      {/* The offer as a ledger: the money is the one lead figure, the other terms are ruled lines beside it. */}
      <Overview
        className="mb-10"
        lead={
          <LeadStat
            label={fullTime ? "Annual CTC" : "Monthly stipend"}
            tone="brand"
            value={
              <>
                {facts.amount}
                {facts.per ? <span className="ml-1 text-lg font-medium text-ink-600">{facts.per.replace(/^\/\s*/, "/")}</span> : null}
              </>
            }
            note={bonusLabel ?? undefined}
          />
        }
        rest={
          <StatList
            items={[
              { label: "Joining date", value: joining },
              ...(fullTime ? [{ label: "Job mode", value: modeLabel(facts.mode) }] : facts.duration ? [{ label: "Duration", value: facts.duration }] : []),
              { label: fullTime ? "Location" : "Work mode", value: fullTime ? facts.location : modeLabel(facts.mode) },
            ]}
          />
        }
      />

      <div className="grid items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ── The decision (focal point; first on a phone) ─────────── */}
        <aside className="lg:sticky lg:top-24 lg:order-2">
          <div className="rounded-lg border border-ink-300 bg-surface-raised p-5 lg:p-6">
            <h2 className="font-display text-lg font-semibold text-ink-900">{open ? "Your decision" : "Where this stands"}</h2>

            {facts.edited && open ? (
              <p className="mt-4 rounded-md bg-info-soft px-4 py-3 text-sm leading-relaxed text-info">
                The company changed this offer after sending it. Read it again before you answer.
              </p>
            ) : null}

            <div className="mt-4">
              <DecisionPanel
                open={open}
                proposalId={proposal.id}
                roleTitle={facts.role}
                company={facts.company ?? "The company"}
                startDate={offer.startDate}
                joiningDate={joiningDay}
                fullTime={fullTime}
                declinesUsed={misses.total}
                freeDeclines={FREE_DECLINES}
                guaranteeEnded={guaranteeEnded(extra, misses)}
                bonusLabel={bonusLabel}
                acceptBlocked={takedownBlock(project.row, "accept")}
                after={
                  <div className="space-y-4">
                    <p className="text-pretty text-sm leading-relaxed text-ink-700">{status.detail}</p>
                    {overlay.disclaimer ? (
                      <div className="flex items-start gap-2.5 rounded-md bg-ink-100 px-4 py-3 text-sm leading-relaxed text-ink-800">
                        <Info className="mt-0.5 size-4 shrink-0 text-ink-600" aria-hidden />
                        <p className="text-pretty">{overlay.disclaimer}</p>
                      </div>
                    ) : null}
                    {facts.key === "hired" ? (
                      <ButtonLink href="/intern/timesheets" variant="primary" block className="text-sm font-semibold">
                        Log your hours
                      </ButtonLink>
                    ) : null}
                  </div>
                }
              />
            </div>
          </div>
        </aside>

        {/* ── The terms ────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-10">
          {ft ? (
            <section>
              <Head
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
            </section>
          ) : (
            <section>
              <Head title="Internship details" />
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
            </section>
          )}

          {/* ── Company ──────────────────────────────────────────── */}
          <section>
            <Head title="Company details" hint={facts.company ?? "Hidden until hire"} />
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
          </section>

          {/* ── Roles & responsibilities ─────────────────────────── */}
          <section>
            <Head title="Roles and responsibilities" />
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
          </section>

          {offer.additionalInfo ? (
            <section>
              <Head title="What the intern will learn" />
              <p className="whitespace-pre-line text-pretty text-base leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{offer.additionalInfo}</p>
            </section>
          ) : null}

          {!fullTime ? (
            <>
              <section>
                <Head title="Required key skills" />
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
              </section>

              <section>
                {/* The snapshot this offer was made on (QA-004 keeps it here). */}
                <Head title={fromSnapshot ? "Your ratings when this was sent" : "Your ratings now"} />
                <ScoreScale rows={ratingRows.map(([label, value]) => ({ label, value }))} />
              </section>

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

/** A section heading on a hairline, with an optional action on the right. */
function Head({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-ink-200 pb-2">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-600">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
