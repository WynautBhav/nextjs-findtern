"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, CalendarX2, Download } from "lucide-react";

import { ProposalDetailBody } from "@/components/admin/proposal-pipeline-drawer";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { toQueryString } from "@/lib/admin/params";
import { StatusBadge, TONE_CLASS } from "@/components/admin/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { filterOffers, offerChips } from "@/lib/admin/project-offers-pure";
import type { ProjectOfferRow } from "@/lib/admin/project-offers";
import { BUCKET_TONE } from "@/lib/admin/proposal-drawer-data";
import { PIPELINE_LABEL, type PipelineBucket } from "@/lib/admin/proposal-pipeline";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const LINK_BTN =
  "inline-flex min-h-9 items-center rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";

/**
 * The row's "N offers" and "N hires": each opens one pop-up listing the students that project's offers went to (the same
 * rows the number counts), with outcome chips, a CSV of exactly what is listed, and each proposal shown inside the pop-up.
 */
export function ProjectOffersTriggers({
  projectId,
  projectName,
  company,
  offersSent,
  hires,
  canOpen,
  canPdf,
}: {
  projectId: string;
  projectName: string;
  company: string;
  offersSent: number;
  hires: number;
  /** interns:read: the pop-up lists candidates' contacts and pay. Without it the numbers stay plain text. */
  canOpen: boolean;
  /** The proposal PDF route's own permission (interns:read today); the link is hidden without it. */
  canPdf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<PipelineBucket | "all">("all");
  const [state, setState] = useState<{ kind: "idle" | "loading" | "error" } | { kind: "ready"; rows: ProjectOfferRow[] }>({ kind: "idle" });
  const [viewing, setViewing] = useState<string | null>(null);
  const returnTo = useRef<string | null>(null);

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/admin/project-offers/${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.rows)) return setState({ kind: "error" });
      setState({ kind: "ready", rows: data.rows as ProjectOfferRow[] });
    } catch {
      setState({ kind: "error" });
    }
  }

  function openWith(f: PipelineBucket | "all") {
    setFilter(f);
    setViewing(null);
    setOpen(true);
    void load();
  }

  const number = (n: number, one: string, f: PipelineBucket | "all", cls: string) =>
    n > 0 && canOpen ? (
      <button type="button" onClick={() => openWith(f)} className={cn(LINK_BTN, "min-h-0 touch:min-h-0", cls)} aria-haspopup="dialog">
        {plural(n, one)}
      </button>
    ) : (
      <span className={cls}>{plural(n, one)}</span>
    );

  return (
    <>
      <p className="text-foreground">{number(offersSent, "offer", "all", "text-sm")}</p>
      <p className="text-[0.8125rem] text-text-subtle">{number(hires, "hire", "hired", "text-[0.8125rem]")}</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          {viewing && state.kind === "ready" ? (
            <ProposalView canPdf={canPdf} row={state.rows.find((r) => r.id === viewing)!} onBack={() => { setViewing(null); requestAnimationFrame(() => document.getElementById(returnTo.current ?? "")?.focus()); }} />
          ) : (
            <OffersList
              projectId={projectId}
              canPdf={canPdf}
              projectName={projectName}
              company={company}
              state={state}
              filter={filter}
              setFilter={setFilter}
              retry={() => void load()}
              onView={(id, from) => { returnTo.current = from; setViewing(id); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OffersList({
  projectId,
  canPdf,
  projectName,
  company,
  state,
  filter,
  setFilter,
  retry,
  onView,
}: {
  projectId: string;
  canPdf: boolean;
  projectName: string;
  company: string;
  state: { kind: "idle" | "loading" | "error" } | { kind: "ready"; rows: ProjectOfferRow[] };
  filter: PipelineBucket | "all";
  setFilter: (f: PipelineBucket | "all") => void;
  retry: () => void;
  onView: (id: string, fromId: string) => void;
}) {
  const rows = state.kind === "ready" ? state.rows : [];
  const chips = offerChips(rows);
  // A chip with no rows left (after a change) falls back to All, so the list is never an empty filter by surprise.
  const active = chips.some((c) => c.key === filter) ? filter : "all";
  const shown = filterOffers(rows, active);

  return (
    <>
      <header className="border-b border-[color:var(--admin-rule)] px-5 pb-4 pt-5 pr-14 sm:px-6">
        <DialogTitle className="text-lg font-semibold leading-snug text-foreground">Offers on {projectName}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-text-subtle">{company}</DialogDescription>
        {state.kind === "ready" && rows.length ? (
          <div role="group" aria-label="Filter by outcome" className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={active === c.key}
                onClick={() => setFilter(c.key)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11",
                  active === c.key ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "bg-[color:var(--admin-panel-2)] text-foreground hover:bg-[color:var(--admin-bar-tint)]",
                )}
              >
                {c.key !== "all" ? <span aria-hidden className={cn("size-1.5 rounded-full", TONE_CLASS[BUCKET_TONE[c.key]].dot)} /> : null}
                {c.label}
                <span className="nums">{formatNumber(c.count)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {state.kind === "loading" || state.kind === "idle" ? (
          <p role="status" className="px-6 py-10 text-center text-sm text-text-subtle">Loading offers…</p>
        ) : state.kind === "error" ? (
          <div role="alert" className="px-6 py-10 text-center text-sm">
            <p className="text-foreground">Could not load the offers.</p>
            <button type="button" onClick={retry} className={cn(LINK_BTN, "mt-2")}>Try again</button>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-text-subtle">No offers sent on this project yet.</p>
        ) : (
          <ul aria-label={`${plural(shown.length, "offer")} shown`}>
            {shown.map((r) => (
              <OfferRow key={r.id} row={r} onView={onView} canPdf={canPdf} />
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--admin-rule)] px-5 py-3 sm:px-6">
        <p className="nums text-sm text-text-subtle" aria-live="polite">
          {state.kind === "ready" ? `${plural(shown.length, "offer")}${active !== "all" ? `, ${PIPELINE_LABEL[active].toLowerCase()}` : ""}` : ""}
        </p>
        {state.kind === "ready" && shown.length ? (
          // Built and audited on the server from the same loader and filter as these rows.
          <a
            href={`/api/admin/project-offers/${encodeURIComponent(projectId)}${toQueryString({ format: "csv", outcome: active === "all" ? "" : active })}`}
            download
            className={cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY, "max-sm:w-full")}
          >
            <Download className="size-4" aria-hidden />
            Download CSV
          </a>
        ) : null}
      </footer>
    </>
  );
}

/** One fixed template, so every column starts at the same x on every row. */
const OFFER_GRID = "md:grid-cols-[minmax(0,1.5fr)_6rem_7.5rem_minmax(9.5rem,1fr)_16rem]";

function OfferRow({ row: r, onView, canPdf }: { row: ProjectOfferRow; onView: (id: string, fromId: string) => void; canPdf: boolean }) {
  const viewId = `view-${r.id}`;
  return (
    <li className={cn("grid items-start gap-x-5 gap-y-2 border-b border-[color:var(--admin-rule)] px-5 py-3.5 last:border-b-0 sm:px-6", OFFER_GRID)}>
      <div className="min-w-0">
        <Link href={`/admin/interns/${r.internId}`} className="break-words text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {r.candidate}
        </Link>
        <p className="truncate text-[0.8125rem] text-text-subtle" title={r.email ?? ""}>{r.email ?? "No email"}</p>
        {r.phone ? <p className="nums text-[0.8125rem] text-text-subtle">{r.phone}</p> : null}
      </div>
      <p className="text-sm text-foreground">{r.kind}</p>
      <div>
        <StatusBadge tone={BUCKET_TONE[r.bucket]} label={PIPELINE_LABEL[r.bucket]} icon={r.bucket === "expired" ? <CalendarX2 /> : undefined} />
      </div>
      <div className="nums text-sm">
        <p className="whitespace-nowrap text-foreground">{r.pay}</p>
        <p className="text-[0.8125rem] text-text-subtle">Sent {r.sent}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:flex-nowrap md:justify-end">
        <button id={viewId} type="button" onClick={() => onView(r.id, viewId)} className={cn(LINK_BTN, "text-sm")}>
          View proposal
        </button>
        <PdfLinks row={r} canPdf={canPdf} />
      </div>
    </li>
  );
}

/** The proposal as a PDF (any sent offer), and the uploaded full-time offer letter when there is one. */
function PdfLinks({ row: r, canPdf }: { row: ProjectOfferRow; canPdf: boolean }) {
  return (
    <>
      {canPdf ? (
      <a href={`/api/admin/proposals/${encodeURIComponent(r.id)}/pdf`} download className={cn(LINK_BTN, "gap-1 text-sm")}>
        <Download className="size-3.5" aria-hidden />
        Download PDF
      </a>
      ) : null}
      {r.pdf.available ? (
        <a href={`/api/proposals/${encodeURIComponent(r.id)}/offer-letter`} target="_blank" rel="noopener noreferrer" className={cn(LINK_BTN, "text-sm")}>
          Offer letter
        </a>
      ) : null}
    </>
  );
}

function ProposalView({ row: r, onBack, canPdf }: { row: ProjectOfferRow; onBack: () => void; canPdf: boolean }) {
  const p = r.drawer;
  return (
    <>
      <header className="border-b border-[color:var(--admin-rule)] px-5 pb-4 pt-4 pr-14 sm:px-6">
        <button type="button" onClick={onBack} className={cn(LINK_BTN, "gap-1 text-sm")} autoFocus>
          <ArrowLeft className="size-4" aria-hidden />
          Back to offers
        </button>
        <DialogTitle className="mt-2 text-lg font-semibold leading-snug text-foreground">
          {p.candidate} · {p.company}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-text-subtle">
          {p.project} · {r.kind}
        </DialogDescription>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge tone={p.outcome.tone} label={p.outcome.label} icon={p.outcome.expired ? <CalendarX2 /> : undefined} />
          {p.expiryLabel ? <span className="text-sm text-text-subtle">{p.expiryLabel}</span> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <ProposalDetailBody proposal={p} />
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--admin-rule)] px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4">
          <PdfLinks row={r} canPdf={canPdf} />
        </div>
        <Link href={`/admin/proposal-tracker/${encodeURIComponent(r.id)}`} className={buttonClass({ size: "sm" })}>
          Open full page
        </Link>
      </footer>
    </>
  );
}
