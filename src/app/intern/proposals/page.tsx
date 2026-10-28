import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, CalendarDays, MapPin } from "lucide-react";

import {
  EmptyScene,
  PageHead,
  Pill,
  SectionHead,
  Surface,
} from "@/components/app/primitives";
import { OfferDecision } from "@/components/app/offer-decision";
import { proposalStatus } from "@/components/app/status";
import {
  declinesUsedBy,
  modeLabel,
  offerFacts,
  type OfferFacts,
} from "@/components/intern/offer/offer-facts";
import { requireRole } from "@/lib/auth";
import { formatJoiningDate } from "@/lib/format";
import { loadInternData, projectNames } from "@/lib/intern-data";
import { canDecide, offerGroup } from "@/lib/intern-offer-view";
import type { ProposalRow } from "@/lib/journey";
import { FREE_DECLINES } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Offers",
  robots: { index: false, follow: false },
};

/**
 * Every offer, grouped by who has to act: the ones waiting on the intern,
 * the ones accepted or hired, and the closed ones. Each card leads with the
 * role, then the money and the joining date (bug sheet 7, S1 r43 / NC r28),
 * and an open offer can be accepted or turned down right here with the same
 * dialogs as the offer page (INW-28).
 */
export default async function InternProposals() {
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const projects = await projectNames(
    data.proposals.map((p) => p.projectId ?? ""),
  );

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = Number(extra.findternScore ?? 0) || 0;
  const guaranteeEnded = typeof extra.guaranteeEndedAt === "string";
  const declinesUsed = declinesUsedBy(data.proposals);

  // Drafts are the company's, not the intern's.
  const rows = data.proposals
    .filter((p) => p.status !== "draft")
    .map((p) => ({
      p,
      facts: offerFacts(p, { score, names: data.names }),
      project: p.projectId ? (projects[p.projectId] ?? null) : null,
    }));
  const groups = {
    open: rows.filter((r) => offerGroup(r.facts.key) === "open"),
    active: rows.filter((r) => offerGroup(r.facts.key) === "active"),
    closed: rows.filter((r) => offerGroup(r.facts.key) === "closed"),
  };

  const decision = { declinesUsed, guaranteeEnded };
  const waiting = groups.open.filter((r) => canDecide(r.facts.key)).length;

  return (
    <div>
      <PageHead
        title="Your offers"
        lede={
          waiting > 0
            ? `${waiting} offer${waiting === 1 ? " is" : "s are"} waiting on your answer. Read each one and decide before its joining date.`
            : "Companies send offers here rather than application forms. You read each one and decide."
        }
      />

      {rows.length === 0 ? (
        <EmptyScene
          art
          title="No offers yet"
          body="When a company wants you, its offer lands here with the role, the stipend and the joining date. Keep your profile complete and open to work so companies can find you."
          next={{ label: "Look at open roles", href: "/intern/opportunities" }}
          who="Companies come to you"
        />
      ) : (
        <div className="space-y-10">
          <Group
            title="Waiting on you"
            hint="Answer before the joining date; on that date an unanswered offer closes as rejected."
            rows={groups.open}
            decision={decision}
          />
          <Group
            title="Accepted and hired"
            rows={groups.active}
            decision={decision}
          />
          <Group
            title="Closed"
            rows={groups.closed}
            decision={decision}
            compact
          />
        </div>
      )}
    </div>
  );
}

type Row = { p: ProposalRow; facts: OfferFacts; project: string | null };

function Group({
  title,
  hint,
  rows,
  decision,
  compact = false,
}: {
  title: string;
  hint?: string;
  rows: Row[];
  decision: { declinesUsed: number; guaranteeEnded: boolean };
  /** Closed offers: the money and the date only. */
  compact?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionHead title={`${title} · ${rows.length}`} hint={hint} />
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <li key={row.p.id} className="min-w-0">
            <OfferCard {...row} decision={decision} compact={compact} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OfferCard({
  p,
  facts,
  project,
  decision,
  compact,
}: Row & {
  decision: { declinesUsed: number; guaranteeEnded: boolean };
  compact: boolean;
}) {
  const status = proposalStatus(facts.key);
  const open = canDecide(facts.key);
  const href = `/intern/proposals/${p.id}`;

  return (
    <Surface as="article" className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={status.tone}>{status.label}</Pill>
        {facts.fullTime ? <Pill tone="live">Full Time Job Role</Pill> : null}
        {facts.edited ? <Pill tone="new">Updated</Pill> : null}
      </div>

      <h3 className="mt-3 text-pretty text-lg font-semibold tracking-[-0.015em] text-ink-900">
        <Link
          href={href}
          className="rounded-apple-sm hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {facts.role}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-ink-600">
        {facts.company ?? "Company shared after hire"}
        {project ? <span className="text-text-subtle"> · {project}</span> : null}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-ink-200/80 pt-4">
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-ink-600">{facts.moneyLabel}</dt>
          <dd className="nums mt-0.5 text-base font-semibold text-ink-900">
            {facts.money}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="flex items-center gap-1.5 text-xs text-ink-600">
            <CalendarDays className="size-3.5" aria-hidden />
            Joining date
          </dt>
          <dd className="nums mt-0.5 text-sm font-medium text-ink-900">
            {formatJoiningDate(facts.startDate)}
          </dd>
        </div>
        {compact ? null : (
          <>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-ink-600">
                <MapPin className="size-3.5" aria-hidden />
                {facts.fullTime ? "Location" : "Work mode"}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-ink-900">
                {facts.fullTime ? facts.location : modeLabel(facts.mode)}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-ink-600">
                <Briefcase className="size-3.5" aria-hidden />
                {facts.fullTime ? "Job mode" : "Duration"}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-ink-900">
                {facts.fullTime ? modeLabel(facts.mode) : facts.duration}
              </dd>
            </div>
          </>
        )}
      </dl>

      {!open ? (
        <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-600">
          {status.detail}
        </p>
      ) : null}

      <div className="mt-auto pt-5">
        {open ? (
          <div className="space-y-3">
            <OfferDecision
              layout="row"
              proposalId={p.id}
              roleTitle={facts.role}
              company={facts.company ?? "The company"}
              startDate={facts.startDate}
              fullTime={facts.fullTime}
              declinesUsed={decision.declinesUsed}
              freeDeclines={FREE_DECLINES}
              guaranteeEnded={decision.guaranteeEnded}
            />
            <Link
              href={href}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
            >
              Read the full offer
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <Link
            href={href}
            className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            See the offer
            <ArrowRight
              className="size-4 apple-spring group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        )}
      </div>
    </Surface>
  );
}
