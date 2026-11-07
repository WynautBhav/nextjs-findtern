import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
  modeLabel,
  offerFacts,
  type OfferFacts,
} from "@/components/intern/offer/offer-facts";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { loadInternData, projectNames } from "@/lib/intern-data";
import { cn } from "@/lib/utils";
import { canDecide, offerGroup } from "@/lib/intern-offer-view";
import type { ProposalRow } from "@/lib/journey";
import { guaranteeEnded as isGuaranteeEnded, guaranteeMisses } from "@/lib/guarantee";
import { FREE_DECLINES } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Offers",
  robots: { index: false, follow: false },
};

/**
 * Every offer, as one list with thin dividers, filtered by who has to act:
 * waiting on the intern, accepted, hired, closed. Each row leads with the
 * role, then the stipend and the joining date (bug sheet 7, S1 r43 / NC r28),
 * and an open offer can be accepted or turned down right here with the same
 * dialogs as the offer page (INW-28). The filter is a link (?show=), so it
 * survives a reload; it opens on "Waiting on you" when anything is.
 */
const GROUPS = [
  { key: "open", label: "Waiting on you" },
  { key: "accepted", label: "Accepted", hint: "You said yes. You're hired once the company pays." },
  { key: "active", label: "Hired" },
  { key: "closed", label: "Closed" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

export default async function InternProposals({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const session = await requireRole("intern");
  const rawShow = (await searchParams).show;
  const show = Array.isArray(rawShow) ? rawShow[0] : rawShow;

  const data = await loadInternData(session.uid);
  const projects = await projectNames(
    data.proposals.map((p) => p.projectId ?? ""),
  );

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = Number(extra.findternScore ?? 0) || 0;
  const misses = guaranteeMisses(data.proposals);
  const guaranteeEnded = isGuaranteeEnded(extra, misses);
  const declinesUsed = misses.total;

  // Drafts are the company's, not the intern's.
  const rows = data.proposals
    .filter((p) => p.status !== "draft")
    .map((p) => ({
      p,
      facts: offerFacts(p, { score, names: data.names }),
      project: p.projectId ? (projects[p.projectId] ?? null) : null,
    }));
  const groups: Record<GroupKey, Row[]> = {
    open: rows.filter((r) => offerGroup(r.facts.key) === "open"),
    accepted: rows.filter((r) => offerGroup(r.facts.key) === "accepted"),
    active: rows.filter((r) => offerGroup(r.facts.key) === "active"),
    closed: rows.filter((r) => offerGroup(r.facts.key) === "closed"),
  };

  const decision = { declinesUsed, guaranteeEnded };
  const waiting = groups.open.filter((r) => canDecide(r.facts.key)).length;
  // Default view: what needs an answer, else everything.
  const view: GroupKey | "all" =
    show === "all" || GROUPS.some((g) => g.key === show) ? (show as GroupKey | "all") : groups.open.length > 0 ? "open" : "all";
  const tabs = [
    ...GROUPS.filter((g) => groups[g.key].length > 0 || g.key === view).map((g) => ({ key: g.key, label: g.label, count: groups[g.key].length })),
    { key: "all", label: "All", count: rows.length },
  ];
  const visible = GROUPS.filter((g) => view === "all" || g.key === view);

  return (
    <div>
      <PageHead
        title="Your offers"
        lede={
          waiting > 0
            ? `${waiting} offer${waiting === 1 ? " waits" : "s wait"} on your answer. An unanswered offer closes on its joining date.`
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
        <div className="space-y-6">
          {tabs.length > 2 ? (
            <nav aria-label="Show offers" className="flex flex-wrap gap-x-5 border-b border-ink-100 sm:gap-x-6">
              {tabs.map((t) => {
                const on = t.key === view;
                return (
                  <Link
                    key={t.key}
                    href={t.key === "open" && groups.open.length > 0 ? "/intern/proposals" : `/intern/proposals?show=${t.key}`}
                    scroll={false}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative -mb-px inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap text-sm outline-none transition-colors",
                      "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
                      "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent",
                      on ? "font-semibold text-ink-900 after:bg-brand-700" : "font-medium text-ink-600 hover:text-ink-900",
                    )}
                  >
                    {t.label}
                    <span className={cn("nums", on ? "text-ink-900" : "text-text-subtle")}>{t.count}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}
          {visible.map((g) => (
            <Group
              key={g.key}
              title={g.label}
              hint={"hint" in g ? g.hint : undefined}
              rows={groups[g.key]}
              decision={decision}
              compact={g.key === "closed"}
              showTitle={view === "all"}
            />
          ))}
          {visible.every((g) => groups[g.key].length === 0) ? (
            <EmptyScene title="Nothing here" body="No offers are in this state right now." next={{ label: "Show all offers", href: "/intern/proposals?show=all" }} />
          ) : null}
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
  showTitle,
}: {
  title: string;
  hint?: string;
  rows: Row[];
  decision: { declinesUsed: number; guaranteeEnded: boolean };
  /** Closed offers: quieter rows, no work details. */
  compact?: boolean;
  /** In "All" each group names itself; filtered, the tab (and its hint) already does, so rows drop the repeat. */
  showTitle: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title}>
      {showTitle ? <SectionHead title={`${title} · ${rows.length}`} hint={hint} /> : null}
      <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
        {rows.map((row) => (
          <li key={row.p.id} className="min-w-0">
            <OfferRow {...row} decision={decision} compact={compact} hideStatus={showTitle ? undefined : title} />
          </li>
        ))}
      </Surface>
    </section>
  );
}

function OfferRow({
  p,
  facts,
  project,
  decision,
  compact,
  hideStatus,
}: Row & {
  decision: { declinesUsed: number; guaranteeEnded: boolean };
  compact: boolean;
  hideStatus?: string;
}) {
  const status = proposalStatus(facts.key);
  const open = canDecide(facts.key);
  const href = `/intern/proposals/${p.id}`;
  const terms = [
    facts.joiningDate ? `Joins ${formatDate(facts.joiningDate)}` : null,
    compact ? null : facts.fullTime ? facts.location : modeLabel(facts.mode),
    compact ? null : facts.fullTime ? modeLabel(facts.mode) : facts.duration,
  ].filter(Boolean);

  return (
    <article className={cn("px-5 py-4 lg:px-6", compact && "py-3")}>
      {/* Role and status left, the stipend right: a long role wraps in its column and the figure stays put. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className={cn("text-pretty font-semibold text-ink-900", compact ? "text-sm" : "text-base")}>
            <Link
              href={href}
              className="rounded-apple-sm hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 touch:inline-flex touch:min-h-11 touch:items-center"
            >
              {facts.role}
            </Link>
          </h3>
        </div>
        <p className="text-right">
          <span className="sr-only">{facts.moneyLabel}: </span>
          <span className={cn("nums font-semibold text-ink-900", facts.amountIsText ? "text-sm font-medium text-ink-600" : compact ? "text-base text-ink-600" : "text-lg")}>
            {facts.amount}
          </span>
          {facts.per ? <span className="ml-1 text-sm text-text-subtle">{facts.per}</span> : null}
        </p>
        <p className="col-span-2 text-sm text-ink-600">
          {facts.company ?? "Company shared after hire"}
          {project ? <span className="text-text-subtle"> · {project}</span> : null}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Inside a filtered tab the pill would only repeat the tab's own name. */}
        {hideStatus && status.label.startsWith(hideStatus) ? null : <Pill tone={status.tone}>{status.label}</Pill>}
        {facts.fullTime ? <Pill tone="live">Full-time role</Pill> : null}
        {facts.edited ? <Pill tone="new">Updated</Pill> : null}
        {terms.length > 0 ? <span className="nums text-sm text-ink-600">{terms.join(" · ")}</span> : null}
      </div>

      {open ? (
        <div className="mt-4">
          <OfferDecision
            layout="row"
            proposalId={p.id}
            roleTitle={facts.role}
            company={facts.company ?? "The company"}
            startDate={facts.startDate}
            joiningDate={facts.joiningDate}
            fullTime={facts.fullTime}
            declinesUsed={decision.declinesUsed}
            freeDeclines={FREE_DECLINES}
            guaranteeEnded={decision.guaranteeEnded}
            aside={
              <Link
                href={href}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-apple-sm px-1 text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:ml-1"
              >
                Read the full offer
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
        </div>
      ) : compact || hideStatus ? null : (
        <p className="mt-2 text-pretty text-sm text-text-subtle">{status.detail}</p>
      )}
    </article>
  );
}
