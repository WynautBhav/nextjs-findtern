import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { StatusPill, proposalStatus } from "@/components/app/proposal-status";
import { getSession } from "@/lib/auth";
import { loadInternData, projectNames } from "@/lib/intern-data";
import { formatDayLabel, formatMoney } from "@/lib/format";
import type { ProposalRow } from "@/lib/journey";

export const metadata: Metadata = {
  title: "Offers",
  robots: { index: false, follow: false },
};

/**
 * Every offer, live and closed.
 *
 * The old version's primary label on each row was `direct` or
 * `interview_first`, which is the shape of our hiring pipeline and not a thing
 * that happened to the person reading it. The company and the role are what
 * matters, so those lead.
 *
 * Open offers come first and are separated from closed ones, because an offer
 * with a decision pending is a different kind of object from a decision that
 * was made six weeks ago, and mixing them in one reverse chronological list
 * buries the one that needs an answer.
 */
export default async function InternProposals() {
  const session = await getSession();
  if (!session) return null;

  const data = await loadInternData(session.uid);
  const projects = await projectNames(data.proposals.map((p) => p.projectId ?? ""));

  const open = data.proposals.filter((p) => p.status === "sent");
  const closed = data.proposals.filter((p) => p.status !== "sent");

  const rows = (list: typeof data.proposals) =>
    list.map((p) => {
      const offer = (p.offerDetails ?? {}) as Record<string, unknown>;
      return {
        p,
        role: typeof offer.roleTitle === "string" ? offer.roleTitle : "Internship",
        company: data.names[p.employerId] ?? "A company on Findtern",
        stipend:
          typeof offer.monthlyAmountMinor === "number"
            ? formatMoney(offer.monthlyAmountMinor, "INR")
            : "Stipend to be confirmed",
        start: typeof offer.startDate === "string" ? offer.startDate : null,
        project: p.projectId ? projects[p.projectId] : null,
      };
    });

  return (
    <div>
      <PageHead
        title="Your offers"
        lede="Companies send offers here rather than application forms. You read each one and decide."
      />

      {data.proposals.length === 0 ? (
        <EmptyScene
          art
          title="No offers yet"
          body="When a company is interested they will send an offer here, with the role, the stipend and the dates, all visible before anyone negotiates with you."
          next={{ label: "Look at open roles", href: "/intern/opportunities" }}
          who="They have to come to you"
        />
      ) : (
        <div className="space-y-10">
          {open.length > 0 ? (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
                  Waiting on you
                </h2>
              </div>
              <ul className="grid gap-3 lg:grid-cols-2">
                {rows(open).map((row) => (
                  <li key={row.p.id}>
                    <OfferCard {...row} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {closed.length > 0 ? (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
                  Decided
                </h2>
              </div>
              <ul className="grid gap-3 opacity-90 lg:grid-cols-2">
                {rows(closed).map((row) => (
                  <li key={row.p.id}>
                    <OfferCard {...row} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function OfferCard({
  p,
  role,
  company,
  stipend,
  start,
}: {
  p: ProposalRow;
  role: string;
  company: string;
  stipend: string;
  start: string | null;
  project: string | null;
}) {
  const status = proposalStatus(p.status);
  const decisionPending = p.status === "sent";

  return (
    <Link
      href={`/intern/proposals/${p.id}`}
      className="group flex h-full flex-col rounded-2xl border border-ink-100 bg-white p-5 transition-[border-color,box-shadow,transform] duration-[var(--dur-standard)] hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_14px_34px_-18px_rgb(7_47_36/0.32)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-pretty text-base font-semibold tracking-[-0.015em] text-ink-900">
            {role}
          </h3>
          <p className="mt-0.5 truncate text-sm text-ink-500">{company}</p>
        </div>
        <StatusPill status={p.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink-100 pt-4">
        <div>
          <dt className="text-xs text-ink-500">Stipend</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">{stipend}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Starts</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink-900">
            {start ? formatDayLabel(start) : "To be agreed"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-600">{status.detail}</p>

      <span className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium text-primary">
        {decisionPending ? "Read and decide" : "See the details"}
        <ArrowRight
          className="size-4 transition-transform duration-[var(--dur-instant)] group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}
