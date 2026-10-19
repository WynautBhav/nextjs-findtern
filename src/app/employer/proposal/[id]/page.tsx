import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ArrowUpRight, CircleGauge } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatMoney } from "@/lib/format";
import { offerPastStart, offerScore, parseOffer } from "@/lib/offer";
import { ProposalActions } from "@/components/employer/proposal-actions";
import { ProposalOfferForm } from "@/components/employer/proposal-offer-form";

export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false, follow: false },
};

type Proposal = typeof schema.proposals.$inferSelect;

/** States an employer can still act on. */
const ACTIONABLE = new Set(["draft", "sent", "accepted", "hired"]);
const EDITABLE = new Set(["draft", "sent"]);

const STATUS: Record<string, { label: string; tone: string; next: string }> = {
  draft: { label: "Draft", tone: "bg-ink-100 text-ink-700", next: "Not sent yet." },
  sent: { label: "Waiting on candidate", tone: "bg-accent-100 text-accent-800", next: "The candidate reads the offer and decides. You can still edit or withdraw it." },
  interview_scheduled: { label: "Interview booked", tone: "bg-brand-50 text-brand-700", next: "The offer opens once the interview has happened." },
  accepted: { label: "Accepted", tone: "bg-success-soft text-success", next: "Pay for this hire to confirm it. Names and contact details unlock on payment." },
  processing: { label: "Payment in progress", tone: "bg-accent-100 text-accent-800", next: "A payment is open for this hire." },
  hired: { label: "Hired", tone: "bg-success-soft text-success", next: "Timesheets run monthly from the start date." },
  rejected: { label: "Declined", tone: "bg-ink-100 text-ink-700", next: "The candidate declined. Nothing further is needed from you." },
  withdrawn: { label: "Withdrawn", tone: "bg-ink-100 text-ink-700", next: "This offer is closed." },
  expired: { label: "Expired", tone: "bg-ink-100 text-ink-700", next: "The start date passed without an answer." },
};

const MODE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

/**
 * One proposal, from the employer's side.
 *
 * The session says who you are; `canAccess` says whether this proposal is
 * yours. Checking only the first is the legacy IDOR. A proposal belonging to
 * another employer is a `notFound()`, not a 403.
 *
 * Layout: the four numbers an employer decides on (monthly, total, start,
 * length) sit in one strip under the title; the terms the candidate reads
 * follow in the order they read them; status and the next action stay in the
 * side column.
 */
export default async function EmployerProposalDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole("employer");

  let proposal: Proposal | undefined;
  try {
    const db = getDb();
    const [row] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    proposal = row;
  } catch {
    // DB unavailable - fall through to notFound() rather than throwing.
  }

  if (!proposal || !session || !canAccess(session, proposal.employerId)) notFound();

  // Names are decoration: a missing lookup must not 404 a proposal the
  // employer is entitled to read.
  let internName = "Candidate";
  let unlocked = false;
  let projectName: string | null = null;
  try {
    const db = getDb();
    const [row] = await db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        projectName: schema.projects.projectName,
      })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.proposals.internId, schema.users.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      .where(eq(schema.proposals.id, proposal.id))
      .limit(1);
    if (row) {
      const first = (row.firstName || "").trim();
      const last = (row.lastName || "").trim();
      // Unmasked once this employer hired them on any project (or admin
      // "View as" - `hiredInternIds` covers both).
      unlocked = (await hiredInternIds(db, proposal.employerId)).has(proposal.internId);
      internName = unlocked
        ? `${first} ${last}`.trim() || "Candidate"
        : initialsOf(first, last) === "?"
          ? "Candidate"
          : `Candidate ${initialsOf(first, last)}`;
    }
    projectName = row?.projectName ?? null;
  } catch {
    // Keep the defaults; the page reads fine without them.
  }

  const raw = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  const offer = parseOffer(raw, proposal.currency);
  const currency = offer.currency;
  const skills = Array.isArray(proposal.skills) ? proposal.skills.filter(Boolean) : [];
  const ratings = Object.entries(proposal.aiRatings ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  const lapsed = (proposal.status === "sent" || proposal.status === "interview_scheduled") && offerPastStart(offer.startDate);
  const statusKey = lapsed ? "expired" : proposal.status;
  const status = STATUS[statusKey] ?? { label: statusKey.replace(/_/g, " "), tone: "bg-ink-100 text-ink-700", next: "" };
  const score = offerScore(raw) ?? 0;
  const editable = EDITABLE.has(proposal.status) && !lapsed && !offer.fullTime;
  const city = typeof raw.city === "string" ? raw.city : "";
  const state = typeof raw.state === "string" ? raw.state : "";
  const officeDays = Number(raw.wfoDays ?? raw.workFromOfficeDays ?? 0) || 0;
  const homeDays = Number(raw.wfhDays ?? raw.workFromHomeDays ?? 0) || 0;

  const strip: [string, string][] = offer.fullTime
    ? [
        ["Annual CTC", offer.fullTime.annualCtcMinor ? formatMoney(offer.fullTime.annualCtcMinor, currency) : "-"],
        ["Hiring fee", offer.fullTime.annualCtcMinor ? formatMoney(Math.round(offer.fullTime.annualCtcMinor * 0.0833), currency) : "-"],
        ["Joining", offer.startDate ? formatDate(offer.startDate) : "-"],
        ["Type", "Full-time"],
      ]
    : [
        ["Monthly", offer.monthlyMinor != null ? formatMoney(offer.monthlyMinor, currency) : "-"],
        ["Total", offer.totalMinor != null ? formatMoney(offer.totalMinor, currency) : "-"],
        ["Starts", offer.startDate ? formatDate(offer.startDate) : "-"],
        ["Length", `${offer.months} month${offer.months === 1 ? "" : "s"}`],
      ];

  const card = "rounded-[20px] border border-ink-200/70 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]";

  return (
    <div>
      <Link
        href="/employer/proposals"
        className="apple-spring inline-flex min-h-11 items-center gap-1.5 rounded-[10px] text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All proposals
      </Link>

      {/* ── Header: who, what, and the numbers ───────────────────────── */}
      <section className={`${card} mt-2 overflow-hidden`}>
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              {offer.fullTime ? "Full-time offer" : "Internship offer"}
              {projectName ? ` · ${projectName}` : ""}
            </p>
            <h1 className="mt-1.5 text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
              {offer.roleTitle || projectName || "Proposal"}
            </h1>
            <p className="mt-1.5 text-sm text-ink-600">
              To{" "}
              <Link
                href={`/employer/intern/${encodeURIComponent(proposal.internId)}`}
                className="font-medium text-ink-900 underline-offset-4 hover:underline"
              >
                {internName}
              </Link>
              {score > 0 ? (
                <span className="ml-2 inline-flex items-center gap-1 tabular-nums text-text-subtle">
                  <CircleGauge className="size-3.5" aria-hidden />
                  {score.toFixed(1)}/10
                </span>
              ) : null}
            </p>
          </div>
          <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold ${status.tone}`}>
            {status.label}
          </span>
        </div>
        <dl className="grid grid-cols-2 border-t border-ink-100 bg-ink-50/50 sm:grid-cols-4">
          {strip.map(([label, value], i) => (
            <div key={label} className={`px-6 py-4 ${i % 2 === 1 ? "border-l border-ink-100" : ""} ${i >= 2 ? "border-t border-ink-100 sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
              <dt className="text-xs text-text-subtle">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums tracking-[-0.01em] text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {!offer.fullTime ? (
            <section className={`${card} p-6`}>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">Terms</h2>
              <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-3">
                <Detail label="Hours per month">{offer.monthlyHours ? `${offer.monthlyHours} h` : "-"}</Detail>
                <Detail label="Hourly rate">{offer.hourlyRateMinor ? `${formatMoney(offer.hourlyRateMinor, currency)}/h` : "-"}</Detail>
                <Detail label="Per-hire charge">{offer.perHireMinor ? formatMoney(offer.perHireMinor, currency) : "None"}</Detail>
                <Detail label="Paid leave">{offer.paidLeavesPerMonth ? `${offer.paidLeavesPerMonth} days a month` : "None"}</Detail>
                <Detail label="Working hours">
                  {offer.shiftFrom && offer.shiftFrom !== "flexible" ? `${offer.shiftFrom}–${offer.shiftTo}` : "Flexible"}
                </Detail>
                <Detail label="Timezone">{offer.timezone || "Asia/Kolkata"}</Detail>
              </dl>
            </section>
          ) : null}

          <section className={`${card} p-6`}>
            <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">Work setup</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-3">
              <Detail label="Mode">{MODE[offer.mode] ?? (offer.fullTime?.jobMode || "-")}</Detail>
              <Detail label="Location">
                {offer.mode === "remote" ? "Remote" : [city, state].filter(Boolean).join(", ") || offer.location || offer.fullTime?.location || "-"}
              </Detail>
              <Detail label="Laptop">
                {offer.laptop === "company" || offer.laptop === "yes" ? "Company provides" : offer.laptop ? "Intern provides" : "-"}
              </Detail>
              {offer.mode === "hybrid" ? (
                <Detail label="Hybrid split">
                  {officeDays} office · {homeDays} home
                </Detail>
              ) : null}
            </dl>
          </section>

          {offer.jd ? (
            <section className={`${card} p-6`}>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">What the intern will do</h2>
              {/* Plain text. The legacy composer stored HTML, so older rows
                  render as text rather than being injected. */}
              <p className="mt-3 whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700">{offer.jd}</p>
            </section>
          ) : null}

          {skills.length > 0 ? (
            <section className={`${card} p-6`}>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">Skills</h2>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li key={skill} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    {skill}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <section className={`${card} p-5`}>
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">What happens next</p>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-700">{status.next}</p>
            <ol className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-xs tabular-nums text-text-subtle">
              <li>Sent {formatDate(proposal.createdAt)}</li>
              {proposal.updatedAt && proposal.updatedAt.getTime() - (proposal.createdAt?.getTime() ?? 0) > 60_000 ? (
                <li>Updated {formatDate(proposal.updatedAt)}</li>
              ) : null}
              {proposal.hiredAt ? <li>Hired {formatDate(proposal.hiredAt)}</li> : null}
            </ol>

            {ACTIONABLE.has(proposal.status) && !lapsed ? (
              <div className="mt-4 grid gap-2">
                <ProposalActions proposalId={proposal.id} status={proposal.status} />
                {editable ? (
                  <ProposalOfferForm
                    proposalId={proposal.id}
                    currency={currency}
                    shortOnly={score > 0 && score < 6}
                    initial={{
                      roleTitle: offer.roleTitle,
                      duration: offer.duration,
                      startDate: offer.startDate ?? undefined,
                      monthlyHours: offer.monthlyHours || undefined,
                      monthlyAmount: offer.monthlyMinor != null ? offer.monthlyMinor / 100 : undefined,
                      paidLeavesPerMonth: offer.paidLeavesPerMonth,
                      message: offer.jd,
                      mode: offer.mode,
                      city,
                      state,
                      officeDays: officeDays || undefined,
                      homeDays: homeDays || undefined,
                      shiftFrom: offer.shiftFrom,
                      shiftTo: offer.shiftTo,
                      laptop: offer.laptop,
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </section>

          {ratings.length > 0 ? (
            <section className={`${card} p-5`}>
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Assessment at sending</p>
              <ul className="mt-3 space-y-2">
                {ratings.map(([key, value]) => (
                  <li key={key} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-ink-700">{key === "overall" ? "Findtern Score" : key}</span>
                    <span className="font-medium tabular-nums text-ink-900">{value}/10</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Link
            href={`/employer/intern/${encodeURIComponent(proposal.internId)}`}
            className="apple-spring apple-pressable flex min-h-11 items-center justify-between gap-2 rounded-[14px] border border-ink-200/70 bg-white px-5 py-3.5 text-sm font-medium text-ink-800 hover:border-brand-300 hover:text-brand-800"
          >
            {unlocked ? `${internName}'s profile` : "Candidate profile"}
            <ArrowUpRight className="size-4 text-ink-400" aria-hidden />
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums text-ink-900">{children}</dd>
    </div>
  );
}

function formatDate(value: Date | string | null): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00+05:30`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
