import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AlertCircle, ArrowLeft, Building2, Download, Phone, Sparkles, User } from "lucide-react";

import { DetailRow, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { OfferDecision } from "@/components/app/offer-decision";
import { proposalStatus } from "@/components/app/status";
import { ScoreBar } from "@/components/app/score-bar";
import { ImportantInstructions } from "@/components/intern/offer/important-instructions";
import { declinesUsedBy, modeLabel, offerFacts } from "@/components/intern/offer/offer-facts";
import { ButtonAnchor, ButtonLink, buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { getDb, hasDb, schema } from "@/lib/db";
import { loadInternData } from "@/lib/intern-data";
import { formatJoiningDate } from "@/lib/format";
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

  // The intern's current ratings, with the Findtern Score as "Overall" so it
  // matches the stipend rule; the proposal's snapshot fills any gaps.
  const current = (extra.ratings ?? {}) as Record<string, unknown>;
  const snapshot = (proposal.aiRatings ?? {}) as Record<string, unknown>;
  const rating = (key: string) => {
    const v = key === "overall" && score > 0 ? score : (current[key] ?? snapshot[key]);
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const ratingRows: [string, number][] = [
    ["Communication", rating("communication")],
    ["Coding", rating("coding")],
    ["Aptitude", rating("aptitude")],
    ["Overall", rating("overall")],
  ];

  const jd = offer.jd;
  const jdHtml = jd && /<[^>]+>/.test(jd) ? sanitizeRichText(jd) : "";
  const scope = (project.row?.scopeOfWork ?? "").trim();
  const joining = formatJoiningDate(offer.startDate);

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
        eyebrow={fullTime ? "Full-time offer" : "Internship offer"}
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
            {fullTime ? <Pill tone="live">Full Time Job Role</Pill> : null}
            {facts.edited ? <Pill tone="new">Updated</Pill> : null}
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ── The decision (focal point; first on a phone) ─────────── */}
        <aside className="lg:sticky lg:top-24 lg:order-2">
          <Surface className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
              {open ? "Your decision" : "Where this stands"}
            </p>
            <p className="mt-4 text-sm text-ink-600">{fullTime ? "Annual CTC" : "Your monthly stipend"}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-ink-900">
              <span className="nums text-3xl font-semibold leading-tight tracking-[-0.02em]">{facts.amount}</span>
              {facts.per ? <span className="text-base font-medium text-ink-600">{facts.per}</span> : null}
            </p>
            <dl className="mt-4 divide-y divide-ink-200/80 border-y border-ink-200/80">
              <DetailRow label="Joining date" value={joining} />
              {fullTime ? (
                <DetailRow label="Job mode" value={modeLabel(facts.mode)} />
              ) : (
                <DetailRow label="Duration" value={facts.duration} />
              )}
            </dl>

            {facts.edited && open ? (
              <p className="mt-4 rounded-apple-sm bg-info-soft px-3.5 py-3 text-sm leading-relaxed text-info">
                The company changed this offer after sending it. Read it again before you answer.
              </p>
            ) : null}

            <div className="mt-5">
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
            <Surface className="p-6">
              <SectionHead
                title="Job details"
                hint="Shared by the company as part of this full-time offer."
                action={
                  ft.offerLetterUrl || ft.offerLetterKey ? (
                    <ButtonAnchor href={`/api/proposals/${proposal.id}/offer-letter`} target="_blank" rel="noreferrer" variant="outline" size="sm" className="min-h-11">
                      <Download className="size-4" aria-hidden />
                      Offer letter
                    </ButtonAnchor>
                  ) : null
                }
              />
              <dl className="divide-y divide-ink-200/80">
                <DetailRow label="Job title" value={facts.role} />
                <DetailRow label="Job mode" value={modeLabel(facts.mode)} />
                <DetailRow label="Location" value={facts.location} />
                <DetailRow label="Joining date" value={joining} />
                <DetailRow label="Shift (IST)" value={shift ?? "Not specified"} />
                <DetailRow label="Company timezone" value={timezone} />
                <DetailRow label="Annual CTC" mono value={<span className="font-semibold">{facts.money}</span>} />
              </dl>
            </Surface>
          ) : (
            <Surface className="p-6">
              <SectionHead title="Internship details" />
              <dl className="divide-y divide-ink-200/80">
                <DetailRow label="Joining date" value={joining} />
                <DetailRow label="Duration" value={facts.duration} />
                <DetailRow
                  label="Weekly schedule"
                  value={rawSchedule ? WEEKLY_SCHEDULES[offer.weeklySchedule].label : "Not specified"}
                />
                <DetailRow label="Shift timings (IST)" value={shift ?? "Not specified"} />
                <DetailRow
                  label="Monthly hours"
                  value={offer.monthlyHours > 0 ? `${offer.monthlyHours} hrs / month` : "About 160 hrs / month"}
                  mono
                />
                <DetailRow label="Leave per month" value={`${offer.paidLeavesPerMonth} / month`} mono />
                <DetailRow label="Work mode" value={modeLabel(facts.mode)} />
                {split ? (
                  <DetailRow label="Hybrid schedule" value={`WFO ${split.office} days · WFH ${split.home} days a week`} />
                ) : null}
                <DetailRow label="Location" value={facts.location} />
                <DetailRow label="Laptop" value={laptopLabel(offer.laptop)} />
                <DetailRow label="Monthly stipend" mono value={<span className="font-semibold">{facts.money}</span>} />
              </dl>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-600">
                Your stipend is paid through Findtern as per the agreed terms.
              </p>
            </Surface>
          )}

          {/* ── Company ──────────────────────────────────────────── */}
          <Surface className="p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-apple-sm bg-accent-100 text-accent-700" aria-hidden>
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">Company details</h2>
                <p className="mt-0.5 text-sm text-ink-600">{facts.company ?? "Hidden until hire"}</p>
              </div>
            </div>
            {!employer.ok ? (
              <p className="mt-4 flex items-start gap-2 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                We couldn&apos;t load the company details. Refresh to try again.
              </p>
            ) : (
              <>
                <dl className="mt-3 divide-y divide-ink-200/80">
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
          <Surface className="p-6">
            <SectionHead title="Roles and responsibilities" />
            {!project.ok && !jd ? (
              <p className="flex items-start gap-2 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                We couldn&apos;t load the role description. Refresh to try again.
              </p>
            ) : jdHtml ? (
              <div className="prose-rt break-words text-[0.9375rem] leading-relaxed text-ink-700 [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: jdHtml }} />
            ) : jd || scope ? (
              <p className="whitespace-pre-line text-pretty text-[0.9375rem] leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{jd || scope}</p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-600">The company did not add a description to this offer.</p>
            )}
          </Surface>

          {!fullTime ? (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <Surface className="p-6">
                  <SectionHead title="AI interview ratings" action={<Sparkles className="size-4 text-accent-500" aria-hidden />} />
                  <ul className="space-y-3">
                    {ratingRows.map(([label, value]) => (
                      <li key={label}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-ink-600">{label}</span>
                          <span className="nums text-sm font-semibold text-brand-700">{value}/10</span>
                        </div>
                        <ScoreBar value={value} />
                      </li>
                    ))}
                  </ul>
                </Surface>

                <Surface className="p-6">
                  <SectionHead title="Required key skills" />
                  {skills.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {skills.map((skill) => (
                        <li key={skill}>
                          <Pill tone="live">{skill}</Pill>
                        </li>
                      ))}
                    </ul>
                  ) : !project.ok ? (
                    <p className="text-sm text-danger">We couldn&apos;t load the skills. Refresh to try again.</p>
                  ) : (
                    <p className="text-sm text-ink-600">No skills highlighted in this offer.</p>
                  )}
                </Surface>
              </div>

              <ImportantInstructions />
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
