"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, CreditCard, Eye, Loader2, Pencil, RotateCcw, Search, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { EmptyScene, Pill } from "@/components/app/primitives";
import { RowMenu, type RowMenuItem } from "@/components/app/row-menu";
import { MessageButton } from "@/components/app/message-button";
import { ProposalAvatar } from "@/components/employer/proposal-avatar";
import type { PresenceLabel } from "@/lib/presence";
import { buttonClass } from "@/components/ui/button";
import type { EmployerProposal } from "@/lib/employer-proposal-view";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseOffer } from "@/lib/offer";
import { offerState } from "@/components/employer/proposal-state";
import { proposalBucket } from "@/components/employer/proposal-bucket";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/employer/ui-tokens";

export type ProposalItem = {
  proposal: EmployerProposal;
  /** Identity only; initials until this employer has hired them. */
  user: { firstName: string; lastName: string } | null;
  project: { id: string; projectName: string } | null;
  /** Hired by this employer on any project - the unmasking rule. */
  internHired: boolean;
  /** Avatar route when they uploaded a photo (shown before hire; the name is not). */
  photoUrl: string | null;
  presence: PresenceLabel | null;
};

function nameOf(item: ProposalItem): string {
  const first = item.user?.firstName?.trim() || "";
  const last = item.user?.lastName?.trim() || "";
  return displayNameOf({ id: item.proposal.internId, fullName: `${first} ${last}`.trim() || "Candidate", initials: initialsOf(first, last) }, item.internHired);
}

/** Rows shown at a time; "Show more" adds another page (as Projects). */
const PAGE = 20;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatStart(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function ProposalsManager({ initialProposals, initialStatus = "all" }: { initialProposals: ProposalItem[]; initialStatus?: string }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalItem[]>(initialProposals);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [projectFilter, setProjectFilter] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const [withdrawTarget, setWithdrawTarget] = useState<ProposalItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      proposals.map((item) => {
        const offer = parseOffer(item.proposal.offerDetails, item.proposal.currency);
        return { item, offer, state: offerState(item.proposal, offer) };
      })
        // Offers waiting on your payment come first: they are the only rows that need you.
        .sort((a, b) => Number(b.state.canPay) - Number(a.state.canPay)),
    [proposals],
  );

  const projectOptions = Array.from(new Map(proposals.filter((p) => p.project).map((p) => [p.project!.id, p.project!.projectName])).entries());

  const counts = { open: 0, accepted: 0, hired: 0, closed: 0 };
  for (const r of rows) {
    const b = proposalBucket(r.item.proposal.status, r.state.lapsed);
    if (b) counts[b] += 1;
  }

  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(({ item, offer, state }) => {
    // Project, role or the initials shown - never a hidden name.
    const hay = `${item.project?.projectName ?? ""} ${offer.roleTitle} ${nameOf(item)}`.toLowerCase();
    if (needle && !hay.includes(needle)) return false;
    if (statusFilter !== "all" && proposalBucket(item.proposal.status, state.lapsed) !== statusFilter) return false;
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

  function menuFor(item: ProposalItem, state: ReturnType<typeof offerState>, href: string): RowMenuItem[] {
    return [
      { label: "View offer", href, icon: <Eye /> },
      ...(state.canEdit ? [{ label: "Edit offer", href: `${href}?edit=1`, icon: <Pencil /> }] : []),
      ...(item.proposal.status === "hired" ? [{ label: "Timesheets", href: "/employer/timesheets", icon: <Clock /> }] : []),
      ...(state.canWithdraw ? [{ label: "Withdraw offer", onSelect: () => setWithdrawTarget(item), icon: <X />, destructive: true }] : []),
    ];
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

  const tabs = [
    { key: "all", label: "All", short: "All", count: rows.length },
    { key: "open", label: "Waiting on candidate", short: "Waiting", count: counts.open },
    // Accepted offers only; running placements' monthly dues are on Orders,
    // so this is not called "payment due" beside the dashboard's count (QA-123).
    { key: "accepted", label: "Accepted · to pay", short: "To pay", count: counts.accepted },
    { key: "hired", label: "Hired", short: "Hired", count: counts.hired },
    { key: "closed", label: "Declined & closed", short: "Closed", count: counts.closed },
  ];
  // A handful of offers reads at a glance; search only earns its place on a longer list.
  const showTools = proposals.length > 5;

  return (
    <div>
      {showTools ? (
        <div className="mb-4 flex gap-2">
          <label className="relative min-w-0 flex-1 sm:max-w-xl">
            <span className="sr-only">Search proposals</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(PAGE);
              }}
              placeholder="Search by role, project or initials"
              className={cn(fieldClass, "rounded-xl pl-10")}
            />
          </label>
          {projectOptions.length > 1 ? (
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setShown(PAGE);
              }}
              className={cn(fieldClass, "w-36 shrink-0 truncate rounded-xl sm:w-56")}
              aria-label="Project"
            >
              <option value="all">All projects</option>
              {projectOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {/* Status tabs with counts, underlined like candidate search. Toggle
          buttons, not role=tab: they narrow one list, they don't switch panels. */}
      <div role="group" aria-label="Show proposals" className="flex flex-wrap gap-x-3 border-b border-ink-100 sm:gap-x-7">
        {tabs.map((t) => {
          const on = statusFilter === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setStatusFilter(t.key);
                setShown(PAGE);
              }}
              className={cn(
                "relative -mb-px inline-flex min-h-12 min-w-11 items-center justify-center gap-1 whitespace-nowrap sm:gap-1.5 text-sm outline-none transition-colors",
                "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
                "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent",
                on ? "font-semibold text-ink-900 after:bg-brand-700" : "font-medium text-ink-700 hover:text-ink-900",
              )}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="max-sm:hidden">{t.label}</span>
              <span className={cn("nums", on ? "text-ink-900" : "text-ink-600")}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {errorMsg ? (
        <p role="alert" className="mt-4 rounded-apple-md border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-ink-800">
          {errorMsg}
        </p>
      ) : null}

      <p className="sr-only" role="status">
        {filtered.length} of {rows.length} proposals
      </p>

      {filtered.length === 0 ? (
        <div className="pt-8">
          <EmptyScene
            title="No proposals here"
            body={filtering ? "Nothing fits this search and status." : "No offers in this group yet."}
            who="You - try another tab"
          />
          {needle || projectFilter !== "all" ? (
            <p className="mt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setProjectFilter("all");
                  setShown(PAGE);
                  // The button unmounts with the empty state: keep focus on the toolbar.
                  searchRef.current?.focus();
                }}
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
              >
                <RotateCcw className="size-4" aria-hidden />
                Clear filters
              </button>
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-4 pt-5">
          {filtered.slice(0, shown).map(({ item, offer, state }) => {
            const ini = initialsOf(item.user?.firstName?.trim() || "", item.user?.lastName?.trim() || "");
            const ft = offer.fullTime;
            // Full-time rows: annual CTC, not "-/month" (EMH-19). Only the
            // employer's own price; the intern's stipend never reaches this view.
            const money = ft
              ? ft.annualCtcMinor
                ? { amount: formatMoney(ft.annualCtcMinor, offer.currency), per: "a year" }
                : null
              : offer.monthlyMinor != null
                ? { amount: formatMoney(offer.monthlyMinor, offer.currency), per: "a month" }
                : null;
            const start = formatStart(offer.startDate);
            const href = `/employer/proposal/${item.proposal.id}`;
            const title = offer.roleTitle || item.project?.projectName || "Internship";
            const who = nameOf(item);
            // One colour per meaning on this list: Hired green, Waiting amber, To pay blue, Closed grey.
            const chipTone = item.proposal.status === "hired" ? "paid" : state.canPay || item.proposal.status === "accepted" ? "new" : state.tone;
            const pill = <Pill tone={chipTone} className="whitespace-nowrap">{state.label}</Pill>;
            const closed = state.tone === "closed";
            const label = "text-[11px] font-semibold uppercase tracking-wider text-text-subtle";
            return (
              <li
                key={item.proposal.id}
                className="relative grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-xs transition-colors hover:border-ink-300 sm:p-5 lg:grid-cols-[3.5rem_minmax(0,1fr)_11rem_13.5rem_auto] lg:items-center lg:gap-x-6"
              >
                <ProposalAvatar photoUrl={item.photoUrl} initials={ini === "?" ? "C" : ini} presence={item.presence} />
                <div className="min-w-0">
                  <p className="text-base leading-snug text-ink-900">
                    {/* The whole card opens the offer: the name's link is
                        stretched over it, and keeps its own focus ring. */}
                    <Link
                      href={href}
                      aria-label={`${title}, ${who}`}
                      className={cn(
                        "break-words font-semibold outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:text-brand-700 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-600",
                        closed ? "text-ink-700" : "text-ink-900",
                      )}
                    >
                      {who}
                    </Link>
                  </p>
                  <p className="mt-0.5 break-words text-sm font-medium text-ink-800">{title}</p>
                  {item.project ? <p className="mt-0.5 break-words text-sm text-ink-700">{item.project.projectName}</p> : null}
                </div>
                <div className="col-span-2 flex flex-col items-start gap-1 lg:col-span-1">
                  <span className={cn(label, "lg:sr-only")}>Status</span>
                  {pill}
                </div>
                <div className="nums col-span-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ink-700 lg:col-span-1 lg:flex-col lg:gap-y-0.5">
                  {money ? (
                    <span>
                      <span className="text-base font-semibold text-ink-900">{money.amount}</span> {money.per}
                    </span>
                  ) : (
                    <span className="text-ink-700">{ft ? "CTC not set" : "Price not set"}</span>
                  )}
                  <span className="lg:whitespace-nowrap">
                    {ft ? "Full-time" : `${offer.months} month${offer.months === 1 ? "" : "s"}`}
                    {start ? ` · ${ft ? "Joins" : "Starts"} ${start}` : ""}
                  </span>
                </div>
                {/* Above the stretched link, so these stay clickable. */}
                <div className="relative z-10 col-span-2 flex items-center gap-3 border-t border-ink-100 pt-3 lg:col-span-1 lg:border-0 lg:pt-0">
                  {/* One visible action, chosen by the state (QA-120); the menu holds the rest. */}
                  <div className="min-w-0 max-sm:flex-1 [&_a]:rounded-xl [&_button]:rounded-xl [&_button]:max-sm:w-full [&_a]:max-sm:w-full lg:w-36 [&_button]:lg:w-full [&_a]:lg:w-full">
                    {state.canPay ? (
                      <Link href="/employer/checkout" className={buttonClass({ variant: "primary" })}>
                        <CreditCard className="size-4" aria-hidden />
                        Pay now
                      </Link>
                    ) : closed ? (
                      <Link href={href} className={buttonClass({ variant: "outline" })} aria-label={`View ${title}, ${who}`}>
                        View
                      </Link>
                    ) : (
                      <MessageButton proposalId={item.proposal.id} counterpartId={item.proposal.internId} />
                    )}
                  </div>
                  {menuFor(item, state, href).length > 0 ? (
                    <RowMenu label={`More actions for ${title}, ${who}`} items={menuFor(item, state, href)} className="touch:size-11" />
                  ) : (
                    // Keeps the visible actions in one column when a row has no menu.
                    <span aria-hidden className="size-10 shrink-0 touch:size-11" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > shown ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 pt-6">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            Show {Math.min(PAGE, filtered.length - shown)} more
          </button>
          <p className="nums text-sm text-ink-600">
            Showing {shown} of {filtered.length}
          </p>
        </div>
      ) : filtering && filtered.length > 0 ? (
        <p className="mt-2 text-sm text-ink-600">
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
