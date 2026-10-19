import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EmptyScene, PageHead, SectionHead } from "@/components/app/primitives";
import { StatusPill, proposalStatus } from "@/components/app/proposal-status";
import { requireRole } from "@/lib/auth";
import { loadInternData, projectNames } from "@/lib/intern-data";
import { formatJoiningDate, formatMoney } from "@/lib/format";
import type { ProposalRow } from "@/lib/journey";
import { parseOffer, internStipendInrMinor, offerPastStart } from "@/lib/offer";

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
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const projects = await projectNames(data.proposals.map((p) => p.projectId ?? ""));

  // An unanswered offer whose start date has arrived reads as expired.
  const shown = data.proposals.map((p) =>
    (p.status === "sent" || p.status === "interview_scheduled") &&
    offerPastStart(((p.offerDetails ?? {}) as Record<string, unknown>).startDate as string | undefined)
      ? { ...p, status: "expired" }
      : p,
  );
  const open = shown.filter((p) => p.status === "sent");
  const closed = shown.filter((p) => p.status !== "sent");

  const score = Number(((data.onboarding?.extraData ?? {}) as Record<string, unknown>).findternScore ?? 0) || 0;

  const rows = (list: typeof data.proposals) =>
    list.map((p) => {
      const offer = (p.offerDetails ?? {}) as Record<string, unknown>;
      return {
        p,
        role: typeof offer.roleTitle === "string" ? offer.roleTitle : "Internship",
        company: data.names[p.employerId] ?? "A company on Findtern",
        stipend: (() => {
          const minor = internStipendInrMinor(parseOffer(p.offerDetails, p.currency), score);
          if (minor === 0) return "Not eligible for stipend";
          return minor != null ? `${formatMoney(minor, "INR")}/month` : "Stipend to be confirmed";
        })(),
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
              <SectionHead title="Waiting on you" />
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
              <SectionHead title="Decided" />
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
      className="apple-spring apple-pressable group flex h-full flex-col rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] hover:border-ink-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-pretty text-base font-semibold tracking-[-0.015em] text-ink-900">
            {role}
          </h3>
          <p className="mt-0.5 truncate text-sm text-ink-600">{company}</p>
        </div>
        <StatusPill status={p.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink-100 pt-4">
        <div>
          <dt className="text-xs text-ink-600">Stipend</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">{stipend}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-600">Joining date</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink-900">
            {formatJoiningDate(start)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-600">{status.detail}</p>

      <span className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium text-primary">
        {decisionPending ? "Read and decide" : "See the details"}
        <ArrowRight
          className="size-4 apple-spring group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}
