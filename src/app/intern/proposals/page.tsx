import type { Metadata } from "next";

import { SignatureHero } from "@/components/intern/kit/hero";
import { CountUp } from "@/components/motion/count-up";
import { Stagger } from "@/components/intern/kit/motion";
import {
  EmptyScene,
  FilterTabs,
  Surface,
} from "@/components/app/primitives";
import { OfferCard, type OfferCardDecision, type OfferCardRow } from "@/components/intern/offer/offer-card";
import { offerFacts } from "@/components/intern/offer/offer-facts";
import { requireRole } from "@/lib/auth";
import { loadInternData, projectNames } from "@/lib/intern-data";
import { guaranteeEnded as isGuaranteeEnded, guaranteeMisses } from "@/lib/guarantee";
import { canDecide, offerGroup } from "@/lib/intern-offer-view";

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
const TABS = ["reply", "working", "past"] as const;
type Tab = (typeof TABS)[number];

export default async function InternProposals({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireRole("intern");
  const sp = await searchParams;

  const data = await loadInternData(session.uid);
  const projects = await projectNames(
    data.proposals.map((p) => p.projectId ?? ""),
  );

  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = Number(extra.findternScore ?? 0) || 0;
  const misses = guaranteeMisses(data.proposals);
  const decision = { declinesUsed: misses.total, guaranteeEnded: isGuaranteeEnded(extra, misses) };

  // Drafts are the company's, not the intern's.
  const rows = data.proposals
    .filter((p) => p.status !== "draft")
    .map((p) => ({
      p,
      facts: offerFacts(p, { score, names: data.names }),
      project: p.projectId ? (projects[p.projectId] ?? null) : null,
    }));
  const by: Record<Tab, Row[]> = {
    reply: rows.filter((r) => offerGroup(r.facts.key) === "open"),
    working: rows.filter((r) => ["accepted", "active"].includes(offerGroup(r.facts.key))),
    past: rows.filter((r) => offerGroup(r.facts.key) === "closed"),
  };
  const waiting = by.reply.filter((r) => canDecide(r.facts.key)).length;
  const requested = TABS.find((t) => t === sp.tab);
  const tab: Tab = requested ?? (by.reply.length ? "reply" : by.working.length ? "working" : by.past.length ? "past" : "reply");
  const shown = by[tab];

  return (
    <Stagger>
      <SignatureHero
        className="mb-6"
        title="Your offers"
        lede={
          waiting > 0
            ? `${waiting} offer${waiting === 1 ? " is" : "s are"} waiting on your answer. Read each one and decide before its joining date.`
            : "Companies send offers here rather than application forms. You read each one and decide."
        }
        aside={
          rows.length > 0 ? (
            <dl className="flex gap-8 lg:gap-10">
              {([["Waiting on you", waiting], ["Accepted or working", by.working.length], ["Past", by.past.length]] as const).map(([label, n]) => (
                <div key={label}>
                  <dd className="text-5xl font-light leading-none tracking-[-0.04em] text-white"><CountUp value={n} duration={1} /></dd>
                  <dt className="mt-2 max-w-[7rem] text-[13px] text-on-dark-subtle">{label}</dt>
                </div>
              ))}
            </dl>
          ) : null
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
        <div className="space-y-4">
          <FilterTabs
            label="Show offers"
            value={tab}
            hrefFor={(k) => `/intern/proposals?tab=${k}`}
            tabs={[
              { key: "reply", label: "Needs your reply", count: by.reply.length },
              { key: "working", label: "Accepted or working", count: by.working.length },
              { key: "past", label: "Past offers", count: by.past.length },
            ]}
          />
          {tab === "reply" && shown.length > 0 ? (
            <p className="text-sm text-text-subtle">
              Answer before the joining date; on that date an unanswered offer closes as rejected.
            </p>
          ) : null}
          {shown.length === 0 ? (
            <Surface className="p-6 text-sm text-ink-600">
              {tab === "reply"
                ? "Nothing needs your reply right now."
                : tab === "working"
                  ? "No accepted or active offers yet."
                  : "No past offers."}
            </Surface>
          ) : (
            <OfferList rows={shown} decision={decision} />
          )}
        </div>
      )}
    </Stagger>
  );
}

type Row = OfferCardRow;

type Decision = OfferCardDecision;

function OfferList({ rows, decision }: { rows: Row[]; decision: Decision }) {
  return (
    <ul className="mt-3 grid gap-4">
      {rows.map((row) => (
        <li key={row.p.id} className="min-w-0">
          <OfferCard {...row} decision={decision} />
        </li>
      ))}
    </ul>
  );
}
