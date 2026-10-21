import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Briefcase, Building2, Clock, Download, MapPin, Phone, Sparkles, User, Wallet } from "lucide-react";

import { DetailRow, Pill, SectionHead, Surface, type Tone } from "@/components/app/primitives";
import { OfferDecision } from "@/components/app/offer-decision";
import { proposalStatus } from "@/components/app/proposal-status";
import { ScoreBar } from "@/components/app/score-bar";
import { ImportantInstructions } from "@/components/intern/offer/important-instructions";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { getDb, hasDb, schema } from "@/lib/db";
import { HIDDEN_COMPANY, loadInternData } from "@/lib/intern-data";
import { formatJoiningDate, formatMoney } from "@/lib/format";
import { toArray } from "@/lib/journey";
import { sanitizeRichText } from "@/lib/richtext";
import { wallTimeToUtc } from "@/lib/timezones";
import { FREE_DECLINES, parseOffer, internStipendInrMinor, offerPastStart } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Offer",
  robots: { index: false, follow: false },
};

const COMPANY_LOCKED = "Company details will be given after the company pays for your approved proposal.";

/** Legacy badge wording (proposal-detail.tsx statusLabel). */
const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  sent: { label: "Awaiting your approval", tone: "waiting" },
  accepted: { label: "Approved", tone: "live" },
  hired: { label: "Hired", tone: "paid" },
  rejected: { label: "Rejected", tone: "closed" },
  expired: { label: "Withdrawn", tone: "closed" },
  withdrawn: { label: "Withdrawn", tone: "closed" },
};

/** Shift in the offer's timezone, shown in IST like the legacy page. */
function shiftIst(from: string, to: string, tz: string, startDate: string | null): string {
  const hhmm = /^\d{1,2}:\d{2}$/;
  if (!hhmm.test(from) || !hhmm.test(to)) return "Not specified";
  const day = /^\d{4}-\d{2}-\d{2}/.test(startDate ?? "") ? startDate!.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const pad = (t: string) => t.padStart(5, "0");
  try {
    const start = wallTimeToUtc(`${day}T${pad(from)}`, tz || "Asia/Kolkata");
    const end = wallTimeToUtc(`${day}T${pad(to)}`, tz || "Asia/Kolkata");
    const fmt = (d: Date) =>
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
    return `${fmt(start)} - ${fmt(end)} IST`;
  } catch {
    return "Not specified";
  }
}

function laptopLabel(raw: string): string {
  const v = raw.toLowerCase();
  if (!v) return "Not specified";
  if (v === "company" || v === "yes") return "Company";
  if (v === "candidate" || v === "own" || v === "no") return "Candidate";
  return raw;
}

/**
 * One offer, in full, laid out like the legacy intern proposal page
 * (FindTern client/src/pages/proposal-detail.tsx): header, company details,
 * internship details and compensation, important instructions, roles and
 * responsibilities, AI interview ratings, required key skills, then the
 * decision. Money is the intern's monthly share only, never a schedule.
 */
export default async function ProposalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const proposal = data.proposals.find((p) => p.id === id);

  // Ownership is checked before anything is read out of the row, so a guessed
  // id returns the same 404 as a missing one and cannot be used to probe for
  // which offers exist.
  if (!proposal || !canAccess(session, proposal.internId)) notFound();

  const parsed = parseOffer(proposal.offerDetails, proposal.currency);
  const fullTime = parsed.fullTime;
  const role = parsed.roleTitle || (fullTime ? "Full Proposal" : "Internship Offer");

  // Non-bypass masking lives in loadInternData; contact details are only
  // fetched once the company name itself is revealed.
  const companyName = data.names[proposal.employerId];
  const revealed = Boolean(companyName) && companyName !== HIDDEN_COMPANY;
  const company = companyName ?? "A company on Findtern";

  let project: { projectName: string; skills: string[] | null; scopeOfWork: string | null } | null = null;
  let employer: {
    companySize: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    primaryContactName: string | null;
    phoneNumber: string;
    countryCode: string;
  } | null = null;
  if (hasDb()) {
    const db = getDb();
    const [p, e] = await Promise.all([
      proposal.projectId
        ? db
            .select({ projectName: schema.projects.projectName, skills: schema.projects.skills, scopeOfWork: schema.projects.scopeOfWork })
            .from(schema.projects)
            .where(eq(schema.projects.id, proposal.projectId))
            .limit(1)
            .catch(() => [])
        : Promise.resolve([]),
      db
        .select({
          companySize: schema.employers.companySize,
          city: schema.employers.city,
          state: schema.employers.state,
          country: schema.employers.country,
          primaryContactName: schema.employers.primaryContactName,
          phoneNumber: schema.employers.phoneNumber,
          countryCode: schema.employers.countryCode,
        })
        .from(schema.employers)
        .where(eq(schema.employers.id, proposal.employerId))
        .limit(1)
        .catch(() => []),
    ]);
    project = p[0] ?? null;
    employer = e[0] ?? null;
  }

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = Number(extra.findternScore ?? 0) || 0;
  const stipendMinor = internStipendInrMinor(parsed, score);
  // One month only (review: "show only 1 month amount"); legacy shows no total.
  const stipendLabel =
    stipendMinor == null ? "No stipend" : stipendMinor === 0 ? "Not eligible for stipend" : `${formatMoney(stipendMinor, "INR")} / month`;
  const durationLabel = `${parsed.months} month${parsed.months === 1 ? "" : "s"}`;

  const declinesUsed = data.proposals.filter(
    (p) => p.status === "rejected" && ((p.offerDetails ?? {}) as Record<string, unknown>).declinedBy === "intern",
  ).length;
  const guaranteeEnded = typeof extra.guaranteeEndedAt === "string";
  const startDate = parsed.startDate;
  // Unanswered on or after its start date: closed, shown as withdrawn.
  const lapsed = (proposal.status === "sent" || proposal.status === "interview_scheduled") && offerPastStart(startDate);
  const statusKey = lapsed ? "expired" : (proposal.status ?? "sent");
  const fallback = proposalStatus(statusKey);
  const status = STATUS_LABEL[statusKey] ?? { label: fallback.label, tone: fallback.tone };
  const decided = proposal.status !== "sent" || lapsed;

  const mode = (fullTime ? fullTime.jobMode : parsed.mode) || "remote";
  const isRemote = mode.toLowerCase() === "remote";
  const employerPlace = [employer?.city, employer?.state, employer?.country].filter(Boolean).join(", ");
  const offerPlace = fullTime ? fullTime.location : parsed.location.toLowerCase() === "remote" ? "" : parsed.location;
  const locationLabel = isRemote ? "Remote" : offerPlace || employerPlace || "To be shared";
  const timezone = parsed.timezone || "Asia/Kolkata";
  const shift = shiftIst(parsed.shiftFrom, parsed.shiftTo, timezone, startDate);

  // Legacy order: project skills, then the skills copied onto the proposal.
  const projectSkills = toArray<string>(project?.skills).map((s) => String(s).trim()).filter(Boolean);
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

  const jd = parsed.jd;
  const jdHtml = jd && /<[^>]+>/.test(jd) ? sanitizeRichText(jd) : "";
  const scope = (project?.scopeOfWork ?? "").trim();

  const contactPhone = employer?.phoneNumber ? `${employer.countryCode ?? ""} ${employer.phoneNumber}`.trim() : "";

  return (
    <div className="mx-auto max-w-4xl space-y-4 md:space-y-6">
      <Link
        href="/intern/proposals"
        className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>

      {/* ── Header ─────────────────────────────────────────────── */}
      <Surface className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-brand-600 text-lg font-semibold text-white"
            aria-hidden
          >
            {role[0]?.toUpperCase() || "P"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink-600">{fullTime ? "Full Proposal" : "Proposal"}</p>
                <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900 md:text-3xl">{role}</h1>
                {project?.projectName ? (
                  <p className="mt-1 text-sm font-semibold text-brand-700">Project: {project.projectName}</p>
                ) : null}
              </div>
              <Pill tone={status.tone}>{status.label}</Pill>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-700">
              <MapPin className="size-4 text-ink-500" aria-hidden />
              <span className="capitalize">{mode}</span>
              {!isRemote && offerPlace ? (
                <>
                  <span className="text-ink-400" aria-hidden>•</span>
                  <span>{offerPlace}</span>
                </>
              ) : null}
              <span className="text-ink-400" aria-hidden>•</span>
              <span>{timezone}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {fullTime ? (
                <>
                  <Pill tone="neutral">Full Time Proposal</Pill>
                  <Pill tone="live">
                    Annual CTC: {fullTime.annualCtcMinor ? formatMoney(fullTime.annualCtcMinor, parsed.currency) : "—"}
                  </Pill>
                </>
              ) : (
                <>
                  <Pill tone="live">{durationLabel}</Pill>
                  <Pill tone="waiting">Stipend: {stipendLabel}</Pill>
                </>
              )}
            </div>
            <p className="mt-3 text-sm text-ink-600">Review all offer details and approve if everything looks good.</p>
          </div>
        </div>
      </Surface>

      {/* ── Accept / reject ────────────────────────────────────── */}
      <Surface className="p-6">
        <SectionHead title={decided ? "What you decided" : "Your decision"} />
        {decided ? (
          <>
            <p className="text-pretty text-sm leading-relaxed text-ink-600">{fallback.detail}</p>
            {proposal.status === "accepted" || proposal.status === "hired" ? (
              <Link
                href="/intern/timesheets"
                className="apple-spring apple-pressable mt-5 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover active:scale-[0.98]"
              >
                Log your hours
              </Link>
            ) : null}
          </>
        ) : (
          <OfferDecision
            proposalId={proposal.id}
            roleTitle={role}
            company={company}
            startDate={startDate}
            fullTime={Boolean(fullTime)}
            declinesUsed={declinesUsed}
            freeDeclines={FREE_DECLINES}
            guaranteeEnded={guaranteeEnded}
          />
        )}
      </Surface>

      {/* ── Full-time offer details ────────────────────────────── */}
      {fullTime ? (
        <Surface className="p-6">
          <SectionHead
            title="Full-time offer details"
            hint="These details were shared by the employer as part of a full-time offer."
            action={
              fullTime.offerLetterUrl || fullTime.offerLetterKey ? (
                <a
                  href={`/api/proposals/${proposal.id}/offer-letter`}
                  target="_blank"
                  rel="noreferrer"
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
                >
                  <Download className="size-4" aria-hidden />
                  Offer letter
                </a>
              ) : null
            }
          />
          <dl className="divide-y divide-ink-100">
            <DetailRow label="Job mode" value={<span className="capitalize">{fullTime.jobMode || "—"}</span>} />
            <DetailRow label="Location" value={isRemote ? "Remote" : fullTime.location || "—"} />
            <DetailRow label="Timezone" value={parsed.timezone || "—"} />
            <DetailRow label="Joining date" value={formatJoiningDate(startDate)} />
            <DetailRow
              label="Annual CTC"
              mono
              value={fullTime.annualCtcMinor ? formatMoney(fullTime.annualCtcMinor, parsed.currency) : "—"}
            />
          </dl>
        </Surface>
      ) : null}

      {/* ── Company details ────────────────────────────────────── */}
      <Surface className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent-100 text-accent-700" aria-hidden>
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">Company details</h2>
              <p className="text-sm text-ink-800">{revealed ? company : "Hidden"}</p>
              <p className="flex items-center gap-2 text-sm text-ink-600">
                <User className="size-3.5 text-ink-400" aria-hidden />
                {revealed && employer?.primaryContactName ? employer.primaryContactName : "Reporting manager"}
              </p>
              <p className="flex items-center gap-2 text-sm text-ink-600">
                <Phone className="size-3.5 text-ink-400" aria-hidden />
                {revealed && contactPhone ? contactPhone : "Contact number"}
              </p>
              <p className="flex items-center gap-2 pt-1 text-sm text-ink-600">
                <span className="text-ink-500">Company size</span>
                <span className="font-medium text-ink-900">{employer?.companySize || "—"}</span>
              </p>
              {!revealed ? <p className="pt-1 text-xs leading-relaxed text-ink-500">{COMPANY_LOCKED}</p> : null}
            </div>
          </div>
          <Link
            href="/intern/proposals"
            className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            Back to proposals
          </Link>
        </div>
      </Surface>

      {!fullTime ? (
        <>
          {/* ── Internship details + Compensation ─────────────── */}
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <Surface className="p-6">
              <SectionHead title="Internship details" action={<Briefcase className="size-4 text-brand-600" aria-hidden />} />
              <dl className="divide-y divide-ink-100">
                <DetailRow label="Joining date" value={formatJoiningDate(startDate)} />
                <DetailRow
                  label="Monthly hours"
                  value={parsed.monthlyHours > 0 ? `${parsed.monthlyHours} hrs / month` : "Approx. 160 hrs / month"}
                />
                <DetailRow
                  label="Shift timings (IST)"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5 text-ink-400" aria-hidden />
                      {shift}
                    </span>
                  }
                />
                <DetailRow label="Leave per month" value={`${parsed.paidLeavesPerMonth} / month`} />
                <DetailRow label="Work mode" value={<span className="capitalize">{mode}</span>} />
                <DetailRow label="Location" value={locationLabel} />
                <DetailRow label="Laptop" value={laptopLabel(parsed.laptop)} />
              </dl>
            </Surface>

            <Surface className="p-6">
              <SectionHead title="Compensation" action={<Wallet className="size-4 text-brand-600" aria-hidden />} />
              <dl className="divide-y divide-ink-100">
                <DetailRow
                  label="Monthly pay"
                  mono
                  value={<span className="text-lg font-semibold tracking-[-0.01em] text-brand-700">{stipendLabel}</span>}
                />
                <DetailRow label="Duration" value={durationLabel} />
              </dl>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-600">
                Final payout and compliance will be handled via Findtern as per agreed terms.
              </p>
            </Surface>
          </div>

          <ImportantInstructions />

          {/* ── Roles & responsibilities ─────────────────────── */}
          <Surface className="p-6">
            <SectionHead title="Roles & responsibilities" />
            {jdHtml ? (
              <div className="prose-rt break-words text-sm text-ink-700 [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: jdHtml }} />
            ) : jd || scope ? (
              <p className="whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{jd || scope}</p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-600">No roles and responsibilities details available for this proposal.</p>
            )}
          </Surface>

          {/* ── AI interview ratings + Required Key Skills ───── */}
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <Surface className="p-6">
              <SectionHead title="AI interview ratings" action={<Sparkles className="size-4 text-accent-500" aria-hidden />} />
              <ul className="space-y-3">
                {ratingRows.map(([label, value]) => (
                  <li key={label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink-600">{label}</span>
                      <span className="text-sm font-semibold tabular-nums text-brand-700">{value}/10</span>
                    </div>
                    <ScoreBar value={value} />
                  </li>
                ))}
              </ul>
            </Surface>

            <Surface className="p-6">
              <SectionHead title="Required Key Skills" />
              {skills.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <li key={skill}>
                      <Pill tone="live">{skill}</Pill>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-600">No skills highlighted in this offer.</p>
              )}
            </Surface>
          </div>
        </>
      ) : null}

      <div className="flex justify-end">
        <Link
          href="/intern/proposals"
          className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-full border border-ink-200 bg-white px-5 text-sm font-medium text-ink-700 hover:bg-ink-50"
        >
          Close
        </Link>
      </div>
    </div>
  );
}
