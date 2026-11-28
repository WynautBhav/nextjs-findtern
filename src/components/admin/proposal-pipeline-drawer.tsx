"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarX2, Download, X } from "lucide-react";

import { csvText } from "@/components/admin/dashboard/board/table-csv";
import { ProposalOfferSummary } from "@/components/admin/proposal-offer-summary";
import { StatusBadge } from "@/components/admin/status-badge";
import { DetailRow } from "@/components/app/primitives";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { DrawerProposal } from "@/lib/admin/proposal-drawer-data";
import { cn } from "@/lib/utils";

/**
 * The Proposal pipeline's two client pieces: the CSV button (exactly the table's columns, for every row the cards and
 * search have filtered to) and the View window (a centred, focus-trapped dialog; Esc and the close buttons shut it). The window
 * gets everything already formatted by the server, so it shows the same words as the full page.
 */

export function PipelineCsvButton({ table, filename }: { table: string[][]; filename: string }) {
  const rows = table.length - 1;
  const download = () => {
    const blob = new Blob([csvText(table)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <button type="button" className={cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY, "max-sm:w-full")} onClick={download} disabled={rows === 0} title={`Download the ${rows} ${rows === 1 ? "row" : "rows"} these filters show`}>
      <Download className="size-4" aria-hidden />
      Download CSV
    </button>
  );
}

export type { DrawerProposal };

export function ProposalViewButton({ proposal: p }: { proposal: DrawerProposal }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View proposal for ${p.candidate} from ${p.company}`}
        className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3.5 text-sm font-medium text-foreground transition-colors hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11"
      >
        View
      </button>
      {/* A centred window (owner, 28 Nov): focus stays inside, Esc and Close shut it, the body scrolls. Near full width on a phone. */}
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-[1.25rem] border-0 bg-background p-0 shadow-[0_30px_80px_-20px_rgb(4_29_23/0.55),0_2px_6px_rgb(4_29_23/0.12)] sm:max-h-[calc(100dvh-3rem)] sm:max-w-[45rem] sm:rounded-[1.75rem]"
      >
        {/* The head is the dashboard window's deep green, so a proposal reads the same across the admin. */}
        <header className="bg-[#0a3a2c] px-5 pb-5 pt-5 text-[#f2faf6] sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-balance text-xl font-medium leading-snug tracking-[-0.01em] text-[#f2faf6]">
                {p.candidate} · {p.company}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[#a9cbbd]">
                {p.project} · {p.typeLabel}
                {p.ppo ? " · PPO" : ""}
              </DialogDescription>
            </div>
            <DialogClose className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-[#f2faf6] transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:size-11">
              <X className="size-4" aria-hidden />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge tone={p.outcome.tone} label={p.outcome.label} icon={p.outcome.expired ? <CalendarX2 /> : undefined} />
            {p.expiryLabel ? <span className="text-sm text-[#d7ebe2]">{p.expiryLabel}</span> : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          <ProposalDetailBody proposal={p} />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--admin-rule)] px-5 py-3 sm:px-6">
          <DialogClose className="inline-flex h-9 items-center rounded-full px-3 text-sm text-foreground transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11">
            Close
          </DialogClose>
          <Link
            href={`/admin/proposal-tracker/${encodeURIComponent(p.id)}`}
            className="inline-flex h-10 items-center rounded-full bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11"
          >
            Open full page
          </Link>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/** The proposal's details (who, offer, timeline, linked interview): the View drawer's body, also shown inside the Projects offers pop-up. */
export function ProposalDetailBody({ proposal: p }: { proposal: DrawerProposal }) {
  return (
    <>
      <section aria-labelledby={`pp-who-${p.id}`}>
        <h3 id={`pp-who-${p.id}`} className="text-sm font-semibold text-foreground">
          Who
        </h3>
        <dl className="mt-1 divide-y divide-[color:var(--admin-rule)]">
          <DetailRow label="Candidate" value={<Link href={`/admin/interns/${p.internId}`} className="text-brand-700 hover:underline">{p.candidate}</Link>} />
          {p.email ? <DetailRow label="Email" value={<a href={`mailto:${p.email}`} className="text-brand-700 hover:underline">{p.email}</a>} /> : null}
          {p.phone ? <DetailRow label="Phone" value={p.phone} mono /> : null}
          <DetailRow label="Company" value={<Link href={`/admin/companies/${p.employerId}`} className="text-brand-700 hover:underline">{p.company}</Link>} />
          <DetailRow label="Flow" value={p.flow} />
          <DetailRow label="Sent" value={p.sent} mono />
          {p.pay.employerMonthly ? <DetailRow label="Employer pays" value={`${p.pay.employerMonthly} a month`} mono /> : null}
          {p.pay.internStipend ? <DetailRow label="Intern stipend" value={`${p.pay.internStipend} a month`} mono /> : null}
          {!p.pay.employerMonthly && !p.pay.internStipend ? <DetailRow label="Pay" value={p.pay.label} mono /> : null}
        </dl>
      </section>

      <section aria-labelledby={`pp-offer-${p.id}`}>
        <h3 id={`pp-offer-${p.id}`} className="text-sm font-semibold text-foreground">
          Offer
        </h3>
        <div className="mt-1">
          <ProposalOfferSummary proposalId={p.id} offerDetails={p.offerDetails} currency={p.currency} />
        </div>
      </section>

      <section aria-labelledby={`pp-time-${p.id}`}>
        <h3 id={`pp-time-${p.id}`} className="text-sm font-semibold text-foreground">
          Timeline
        </h3>
        {p.steps.length ? (
          <ol className="mt-1 divide-y divide-[color:var(--admin-rule)]">
            {p.steps.map((s) => (
              <li key={s.key} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="text-sm font-medium text-foreground">{s.label}</span>
                <span className="nums text-sm text-text-subtle">{s.at}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-text-subtle">No dated steps recorded.</p>
        )}
      </section>

      <section aria-labelledby={`pp-meet-${p.id}`}>
        <h3 id={`pp-meet-${p.id}`} className="text-sm font-semibold text-foreground">
          Linked interview
        </h3>
        {p.interview ? (
          <dl className="mt-1 divide-y divide-[color:var(--admin-rule)]">
            <DetailRow label="Status" value={<StatusBadge value={p.interview.status} />} />
            <DetailRow label="Booked" value={p.interview.booked} mono />
            <DetailRow label="Slot" value={p.interview.slot} mono />
            <DetailRow
              label="Meeting link"
              value={p.interview.link ? <a href={p.interview.link} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Open link</a> : "No link"}
            />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-text-subtle">{p.flow === "Interview first" ? "The interview record is no longer linked." : "Direct offer, no interview."}</p>
        )}
      </section>
    </>
  );
}
