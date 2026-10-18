import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Briefcase, CalendarDays, CircleGauge, MessageSquareText } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { initialsOf } from "@/lib/employer-candidates";
import { isAdminViewing } from "@/lib/employer-visibility";
import { formatMoney } from "@/lib/format";
import {
  durationMonths,
  normaliseCurrency,
  type Currency,
} from "@/lib/employer-pricing";
import { PageHeader } from "@/components/layout/page-header";
import { ProposalActions } from "@/components/employer/proposal-actions";
import { ProposalOfferForm } from "@/components/employer/proposal-offer-form";

export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false, follow: false },
};

type Proposal = typeof schema.proposals.$inferSelect;

/* `offer_details` is a free-form jsonb bag. These are the keys
 * `employer-send-proposal.tsx` writes and the intern's own proposal page reads
 * back, so they are the ones worth naming. Anything else renders generically. */
type OfferDetails = {
  roleTitle?: string;
  jd?: string;
  message?: string;
  mode?: string;
  location?: string;
  duration?: string;
  startDate?: string;
  monthlyHours?: number;
  monthlyAmount?: number;
  totalPrice?: number;
  hourlyRate?: number;
  perHireCharge?: number;
  shiftFrom?: string;
  shiftTo?: string;
  laptop?: string;
  paidLeavesPerMonth?: number;
  workFromHomeDays?: number;
  workFromOfficeDays?: number;
};

const DURATION_LABEL: Record<string, string> = {
  "1m": "1 month",
  "2m": "2 months",
  "3m": "3 months",
  "6m": "6 months",
};

/** `sent` and `interview_scheduled` are the only states an employer can act on. */
const ACTIONABLE = new Set(["draft", "sent"]);

/**
 * One proposal, from the employer's side.
 *
 * The session says who you are; `canAccess` says whether this proposal is
 * yours. Checking only the first is the legacy IDOR - `guards.ts` has the long
 * version of why that mattered. A proposal belonging to another employer is a
 * `notFound()`, not a 403, because its id being valid tells the caller nothing
 * they did not already get from the listing.
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
    const [row] = await db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.id, id))
      .limit(1);
    proposal = row;
  } catch {
    // DB unavailable - fall through to notFound() rather than throwing.
  }

  if (!proposal || !session || !canAccess(session, proposal.employerId)) notFound();

  // Intern and project names are decoration: a missing lookup must not 404 a
  // proposal the employer is entitled to read.
  let internName: string | null = null;
  let projectName: string | null = null;
  let projectSkills: string[] = [];
  try {
    const db = getDb();
    const [row] = await db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        projectName: schema.projects.projectName,
        projectSkills: schema.projects.skills,
      })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.proposals.internId, schema.users.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      .where(eq(schema.proposals.id, proposal.id))
      .limit(1);
    if (row) {
      // Redacted until hire - same rule as every other employer surface.
      const first = (row.firstName || "").trim();
      const last = (row.lastName || "").trim();
      internName =
        proposal.status === "hired" || (await isAdminViewing())
          ? `${first} ${last}`.trim() || "Candidate"
          : initialsOf(first, last) === "?"
            ? "Candidate"
            : initialsOf(first, last);
    }
    projectName = row?.projectName ?? null;
    projectSkills = Array.isArray(row?.projectSkills) ? row.projectSkills.filter(Boolean) : [];
  } catch {
    // Keep the nulls; the page reads fine without them.
  }

  const offer = (proposal.offerDetails ?? {}) as OfferDetails;
  const skills = Array.isArray(proposal.skills) ? proposal.skills.filter(Boolean) : [];
  const currency = normaliseCurrency(proposal.currency);
  const ratings = proposal.aiRatings ?? {};
  const ratingEntries = Object.entries(ratings).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  const months = durationMonths(offer.duration);
  const actionable = ACTIONABLE.has(proposal.status);

  return (
    <div>
      <Link
        href="/employer/proposals"
        className="apple-spring inline-flex min-h-11 items-center gap-1.5 rounded-[10px] text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All proposals
      </Link>

      <PageHeader
        title={offer.roleTitle || projectName || "Proposal"}
        subtitle={internName ? `Offer to ${internName}` : "Offer"}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Briefcase className="size-4 text-ink-400" aria-hidden />
              Terms
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label="Project">{projectName ?? "Not recorded"}</Detail>
              <Detail label="Duration">
                {offer.duration && DURATION_LABEL[offer.duration]
                  ? DURATION_LABEL[offer.duration]
                  : "Not stated"}
              </Detail>
              <Detail label="Start date">{offer.startDate ?? "Not stated"}</Detail>
              <Detail label="Work mode">
                {offer.mode ? capitalise(offer.mode) : "Not stated"}
              </Detail>
              <Detail label="Location">{offer.location || "Not stated"}</Detail>
              <Detail label="Laptop">{offer.laptop ? `${capitalise(offer.laptop)} provided` : "Not stated"}</Detail>
              <Detail label="Hours per month">
                {typeof offer.monthlyHours === "number" && offer.monthlyHours > 0
                  ? `${offer.monthlyHours} h`
                  : "Not stated"}
              </Detail>
              <Detail label="Paid leaves per month">
                {typeof offer.paidLeavesPerMonth === "number" && offer.paidLeavesPerMonth > 0
                  ? `${offer.paidLeavesPerMonth} days`
                  : "None stated"}
              </Detail>
            </dl>

            {offer.mode === "hybrid" ? (
              <p className="mt-4 rounded-[10px] bg-ink-50 px-3.5 py-3 text-xs leading-relaxed text-ink-600">
                Hybrid split: {offer.workFromHomeDays ?? 0} day(s) from home,{" "}
                {offer.workFromOfficeDays ?? 0} from the office.
              </p>
            ) : null}
          </section>

          <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <h2 className="text-sm font-semibold text-ink-900">Compensation</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label={`Monthly (${months} mo)`}>{money(offer.monthlyAmount, currency)}</Detail>
              <Detail label="Hourly rate">
                {typeof offer.hourlyRate === "number" && offer.hourlyRate > 0
                  ? `${formatMoney(Math.round(offer.hourlyRate * 100), currency)}/hr`
                  : "Not stated"}
              </Detail>
              <Detail label="Per-hire charge">{perHire(offer.perHireCharge, currency)}</Detail>
              <Detail label="Total">
                {money(offer.totalPrice, currency)}
              </Detail>
            </dl>
          </section>

          {offer.jd ?? offer.message ? (
            <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <MessageSquareText className="size-4 text-ink-400" aria-hidden />
                Cover note
              </h2>
              {/* Stored as plain text by the current composer. The legacy
                  composer used a WYSIWYG and stored HTML, so anything
                  pre-existing is rendered as text rather than injected. */}
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {offer.jd ?? offer.message}
              </p>
            </section>
          ) : null}

          {skills.length > 0 ? (
            <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
              <h2 className="text-sm font-semibold text-ink-900">Skills on this proposal</h2>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
              {projectSkills.length > 0 && projectSkills.length !== skills.length ? (
                <p className="mt-4 text-xs text-text-subtle">
                  The project lists {projectSkills.length} skills in total; this proposal names{" "}
                  {skills.length}.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Status
            </p>
            <p className="mt-2 inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-medium capitalize text-brand-700">
              {proposal.status.replace(/_/g, " ")}
            </p>
            <p className="mt-3 tabular-nums text-xs text-text-subtle">
              Sent {formatDay(proposal.createdAt)}
            </p>
            {proposal.hiredAt ? (
              <p className="mt-1 tabular-nums text-xs text-text-subtle">
                Hired {formatDay(proposal.hiredAt)}
              </p>
            ) : null}
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-ink-600">
              <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
              {proposal.flowType === "interview_first"
                ? "Interview first - an interview has to be scheduled before this becomes an offer."
                : "Direct flow - sent straight to the candidate."}
            </p>
          </section>

          {ratingEntries.length > 0 ? (
          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Assessment snapshot
            </p>
              <p className="mt-1 text-xs text-text-subtle">
                Copied from the candidate at the time of sending. It does not refresh.
              </p>
              <ul className="mt-3 space-y-2">
                {ratingEntries.map(([key, value]) => (
                  <li key={key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 capitalize text-ink-700">
                      <CircleGauge className="size-3.5 text-ink-400" aria-hidden />
                      {key}
                    </span>
                    <span className="font-medium tabular-nums text-ink-900">{value}/10</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Status actions
            </p>
            {actionable ? (
              <>
                <div className="mt-3 grid gap-2">
                  <ProposalActions proposalId={proposal.id} status={proposal.status} />
                  <ProposalOfferForm
                    proposalId={proposal.id}
                    initial={{
                      roleTitle: offer.roleTitle,
                      duration: offer.duration,
                      startDate: offer.startDate,
                      monthlyHours: offer.monthlyHours,
                      paidLeavesPerMonth: offer.paidLeavesPerMonth,
                      message: offer.jd ?? offer.message,
                    }}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-text-subtle">
                  Terms stay editable until the candidate responds. Withdrawing closes the
                  offer for good.
                </p>
              </>
            ) : (
              <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
                {proposal.status === "accepted"
                  ? "The candidate accepted. The next step is the timesheet for the first period."
                  : proposal.status === "rejected"
                    ? "The candidate declined. Nothing further is needed from you."
                    : "This proposal is closed. No action is available."}
              </p>
            )}
          </section>

          {internName ? (
            <Link
              href={`/employer/intern/${encodeURIComponent(proposal.internId)}`}
              className="apple-spring apple-pressable block min-h-11 rounded-[10px] border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-medium text-brand-700 hover:border-brand-300 hover:bg-brand-100"
            >
              Open {internName}&apos;s profile
            </Link>
          ) : null}
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

/** `currency` on the row, money in major units in `offer_details`. */
function money(amount: unknown, currency: Currency): string {
  return typeof amount === "number" && amount > 0
    ? formatMoney(Math.round(amount * 100), currency)
    : "Not stated";
}

/** Format per-hire charge. */
function perHire(amount: unknown, currency: Currency): string {
  if (typeof amount !== "number") return formatMoney(currency === "USD" ? 5000 : 500000, currency);
  return formatMoney(Math.round(amount * 100), currency);
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDay(value: Date | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
