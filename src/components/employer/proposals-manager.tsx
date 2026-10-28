"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Pencil, Search, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { EmptyScene, FilterTabs, Pill, Surface } from "@/components/app/primitives";
import { RowMenu } from "@/components/app/row-menu";
import { buttonClass } from "@/components/ui/button";
import type { Proposal } from "@/lib/db/schema";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseOffer } from "@/lib/offer";
import { offerState } from "@/components/employer/proposal-state";
import { cn } from "@/lib/utils";

export type ProposalItem = {
  proposal: Proposal;
  /** Identity only; initials until this employer has hired them. */
  user: { firstName: string; lastName: string } | null;
  project: { id: string; projectName: string } | null;
  /** Hired by this employer on any project - the unmasking rule. */
  internHired: boolean;
};

function nameOf(item: ProposalItem): string {
  const first = item.user?.firstName?.trim() || "";
  const last = item.user?.lastName?.trim() || "";
  return displayNameOf({ fullName: `${first} ${last}`.trim() || "Candidate", initials: initialsOf(first, last) }, item.internHired);
}

/** Status filter buckets (the raw enums never reach the select). */
const FILTERS: { value: string; label: string; match: (status: string, lapsed: boolean) => boolean }[] = [
  { value: "open", label: "Waiting on candidate", match: (s, l) => !l && (s === "sent" || s === "interview_scheduled" || s === "draft") },
  { value: "accepted", label: "Accepted, to pay", match: (s) => s === "accepted" || s === "processing" },
  { value: "hired", label: "Hired", match: (s) => s === "hired" },
  { value: "closed", label: "Closed", match: (s, l) => l || ["rejected", "withdrawn", "expired"].includes(s) },
];

/** Offer · pay · starts · status · actions; one row per offer at desktop. */
const ROW_GRID = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_11rem_6.5rem_12.5rem_9.5rem]";

function formatStart(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function ProposalsManager({ initialProposals }: { initialProposals: ProposalItem[] }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalItem[]>(initialProposals);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [withdrawTarget, setWithdrawTarget] = useState<ProposalItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const rows = useMemo(
    () =>
      proposals.map((item) => {
        const offer = parseOffer(item.proposal.offerDetails, item.proposal.currency);
        return { item, offer, state: offerState(item.proposal, offer) };
      }),
    [proposals],
  );

  const projectOptions = Array.from(new Map(proposals.filter((p) => p.project).map((p) => [p.project!.id, p.project!.projectName])).entries());

  const counts = {
    open: rows.filter((r) => FILTERS[0].match(r.item.proposal.status, r.state.lapsed)).length,
    accepted: rows.filter((r) => FILTERS[1].match(r.item.proposal.status, r.state.lapsed)).length,
    hired: rows.filter((r) => r.item.proposal.status === "hired").length,
    closed: rows.filter((r) => FILTERS[3].match(r.item.proposal.status, r.state.lapsed)).length,
  };

  const needle = search.trim().toLowerCase();
  const filter = FILTERS.find((f) => f.value === statusFilter);
  const filtered = rows.filter(({ item, offer, state }) => {
    // Project, role or the initials shown - never a hidden name.
    const hay = `${item.project?.projectName ?? ""} ${offer.roleTitle} ${nameOf(item)}`.toLowerCase();
    if (needle && !hay.includes(needle)) return false;
    if (filter && !filter.match(item.proposal.status, state.lapsed)) return false;
    if (projectFilter !== "all" && item.proposal.projectId !== projectFilter) return false;
    return true;
  });
  const filtering = Boolean(needle) || statusFilter !== "all" || projectFilter !== "all";

  async function handleWithdraw() {
    if (!withdrawTarget) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await csrfFetch(`/api/proposals/${withdrawTarget.proposal.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "withdrawn" }),
      });
      if (res.ok) {
        const id = withdrawTarget.proposal.id;
        setProposals((prev) =>
          prev.map((p) => (p.proposal.id === id ? { ...p, proposal: { ...p.proposal, status: "withdrawn", updatedAt: new Date() } } : p)),
        );
        setWithdrawTarget(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "The offer wasn't withdrawn. Try again.");
      }
    } catch {
      setErrorMsg("You appear to be offline. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  if (proposals.length === 0) {
    return (
      <EmptyScene
        art
        title="No proposals yet"
        body="Open a candidate, then use Send proposal. The offer is priced from their Findtern Score, and you pay only once they accept."
        next={{ label: "Browse candidates", href: "/employer/candidates" }}
        who="You - send the first offer"
      />
    );
  }

  const field =
    "apple-spring min-h-11 rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20";

  return (
    <div className="space-y-6">
      {/* One toolbar row: status (with counts, in place of four tiles that
          repeated them), then search and project. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          label="Show proposals"
          value={statusFilter}
          onChange={setStatusFilter}
          tabs={[
            { key: "all", label: "All", count: rows.length },
            { key: "open", label: "Waiting on candidate", count: counts.open },
            // Accepted offers only; running placements' monthly dues are on Orders,
            // so this is not called "payment due" beside the dashboard's count (QA-123).
            { key: "accepted", label: "Accepted, to pay", count: counts.accepted },
            { key: "hired", label: "Hired", count: counts.hired },
            { key: "closed", label: "Closed", count: counts.closed },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
          <label className="relative min-w-0 sm:w-64">
            <span className="sr-only">Search proposals</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Role, project or initials"
              className={cn(field, "w-full pl-9")}
            />
          </label>
          {projectOptions.length > 1 ? (
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={field} aria-label="Project">
              <option value="all">All projects</option>
              {projectOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {errorMsg ? (
        <p role="alert" className="rounded-apple-md border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-ink-800">
          {errorMsg}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyScene
          title="No proposals match"
          body="Nothing fits this search and status. Clear the filters to see every offer."
          who="You - loosen the filters"
        />
      ) : (
        <Surface className="overflow-hidden">
          {/* Column labels for sighted scanning; every row also says what each
              figure is, so the list reads on its own to a screen reader. */}
          <div aria-hidden className={cn(ROW_GRID, "hidden gap-x-6 border-b border-ink-100 px-5 py-2.5 text-xs font-medium text-text-subtle lg:grid")}>
            <span>Offer</span>
            <span className="text-right">Pay</span>
            <span>Starts</span>
            <span>Status</span>
            <span />
          </div>
          <ul className="divide-y divide-ink-100">
          {filtered.map(({ item, offer, state }) => {
            const ini = initialsOf(item.user?.firstName?.trim() || "", item.user?.lastName?.trim() || "");
            const ft = offer.fullTime;
            // Full-time rows: annual CTC, not "—/month" (EMH-19).
            const money = ft
              ? ft.annualCtcMinor
                ? `${formatMoney(ft.annualCtcMinor, offer.currency)} a year`
                : "CTC not set"
              : offer.monthlyMinor != null
                ? `${formatMoney(offer.monthlyMinor, offer.currency)} a month`
                : null;
            const start = formatStart(offer.startDate);
            const href = `/employer/proposal/${item.proposal.id}`;
            const title = offer.roleTitle || item.project?.projectName || "Internship";
            return (
              <li
                key={item.proposal.id}
                className={cn(ROW_GRID, "relative grid items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-ink-50/70")}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-800">
                    {ini === "?" ? "C" : ini}
                  </span>
                  <div className="min-w-0">
                    {/* The whole row opens the offer: the title's link is
                        stretched over it, and keeps its own focus ring. */}
                    <Link
                      href={href}
                      className="block break-words text-[0.9375rem] font-semibold text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-apple-sm focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
                    >
                      {title}
                    </Link>
                    <p className="text-sm text-ink-600">
                      {nameOf(item)}
                      {item.project ? ` · ${item.project.projectName}` : ""}
                      {ft ? " · Full-time" : ""}
                    </p>
                  </div>
                </div>
                <p className="nums text-sm font-semibold text-ink-900 max-lg:col-span-2 max-lg:row-start-2 max-lg:pl-12 lg:text-right">
                  {money ?? <span className="font-normal text-text-subtle">Not set</span>}
                  {!ft ? <span className="font-normal text-ink-600"> · {offer.months} mo</span> : null}
                  {start ? <span className="font-normal text-ink-600 lg:hidden"> · {ft ? "joins" : "starts"} {start}</span> : null}
                </p>
                <p className="nums text-sm text-ink-700 max-lg:hidden">
                  {start ? (
                    <>
                      <span className="lg:sr-only">{ft ? "Joins " : "Starts "}</span>
                      {start}
                    </>
                  ) : (
                    <span className="text-text-subtle">Not set</span>
                  )}
                </p>
                <div className="max-lg:col-span-2 max-lg:row-start-3 max-lg:pl-12">
                  <Pill tone={state.tone} className="whitespace-nowrap">{state.label}</Pill>
                </div>
                {/* Above the stretched link, so these stay clickable. */}
                <div className="relative z-10 flex items-center justify-end gap-1 max-lg:col-start-2 max-lg:row-start-1">
                  {/* One visible action, chosen by the state; the row itself
                      opens the offer, and the menu holds only the rest (QA-120). */}
                  {state.canPay ? (
                    <Link href="/employer/checkout" className={buttonClass({ variant: "accent", size: "sm" })}>
                      <CreditCard className="size-4" aria-hidden />
                      Pay to hire
                    </Link>
                  ) : state.canEdit ? (
                    <Link href={`${href}?edit=1`} className={buttonClass({ variant: "outline", size: "sm" })}>
                      <Pencil className="size-4" aria-hidden />
                      Edit offer
                    </Link>
                  ) : item.proposal.status === "hired" ? (
                    <Link href="/employer/timesheets" className={buttonClass({ variant: "outline", size: "sm" })}>
                      Timesheets
                    </Link>
                  ) : null}
                  {state.canWithdraw || (state.canEdit && state.canPay) ? (
                    <RowMenu
                      label={`More actions for ${title}, ${nameOf(item)}`}
                      items={[
                        ...(state.canEdit && state.canPay ? [{ label: "Edit offer", href: `${href}?edit=1`, icon: <Pencil /> }] : []),
                        ...(state.canWithdraw ? [{ label: "Withdraw offer", onSelect: () => setWithdrawTarget(item), icon: <X />, destructive: true }] : []),
                      ]}
                    />
                  ) : (
                    // Keeps the visible actions in one column when a row has no menu.
                    <span aria-hidden className="size-10 shrink-0" />
                  )}
                </div>
              </li>
            );
          })}
          </ul>
        </Surface>
      )}
      {filtering && filtered.length > 0 ? (
        <p className="text-sm text-ink-600">
          Showing <span className="nums font-semibold text-ink-900">{filtered.length}</span> of <span className="nums">{proposals.length}</span>
        </p>
      ) : null}

      <Dialog open={Boolean(withdrawTarget)} onOpenChange={(open) => !open && !busy && setWithdrawTarget(null)}>
        <DialogContent className="rounded-apple-xl sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-semibold text-ink-900">Withdraw this offer?</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-600">
              {withdrawTarget?.proposal.status === "accepted"
                ? "The candidate already accepted. Withdrawing tells them it won't go ahead. This can't be undone."
                : "The candidate can no longer accept it, and they are told. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          {withdrawTarget ? (
            <p className="rounded-apple-md bg-ink-50 px-4 py-3 text-sm text-ink-800">
              <span className="font-semibold">{parseOffer(withdrawTarget.proposal.offerDetails).roleTitle || "Internship"}</span>
              {" · "}
              {nameOf(withdrawTarget)}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setWithdrawTarget(null)} disabled={busy} className={buttonClass({ variant: "outline", size: "sm" })}>
              Keep it
            </button>
            <button type="button" onClick={handleWithdraw} disabled={busy} className={buttonClass({ variant: "dark", size: "sm" })}>
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Withdraw offer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
