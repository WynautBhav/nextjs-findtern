"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, CreditCard, Eye, Hourglass, Loader2, Pencil, RotateCcw, Search, Send, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatIst, formatMoney } from "@/lib/format";
import type { CgpaGate } from "@/lib/cgpa-verification";
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
import { counterRow, EXPIRED_CARD_NOTE, offerState } from "@/components/employer/proposal-state";
import { closedBreakdown, proposalCounts } from "@/components/employer/proposal-bucket";
import { closedSummary, inTab, TAB_EMPTY, TAB_EXPLAINER, TAB_LABEL, tabFromParam, type TabKey } from "@/components/employer/proposal-tabs";
import { CgpaAckButton } from "@/components/employer/proposal-actions";
import { cn } from "@/lib/utils";
import { TakedownBadge } from "@/components/employer/takedown-badge";
import { TakedownBanner } from "@/components/employer/takedown-banner";
import { TAKEN_DOWN_SHORT } from "@/components/employer/takedown-ui";
import { fieldClass } from "@/components/employer/ui-tokens";

export type ProposalItem = {
  proposal: EmployerProposal;
  /** Identity only; initials until this employer has hired them. */
  user: { firstName: string; lastName: string } | null;
  project: { id: string; projectName: string; /** Findtern took the project down: the offer is view only. */ takenDown?: boolean } | null;
  /** Hired by this employer on any project - the unmasking rule. */
  internHired: boolean;
  /** Avatar route when they uploaded a photo (shown before hire; the name is not). */
  photoUrl: string | null;
  presence: PresenceLabel | null;
  /** Where the candidate's CGPA check stands, only while it blocks payment (derived on the server: the intern's own data stays there). */
  gate: CgpaGate | null;
  /** A payment order is open for this offer: it freezes expiry. */
  hasOpenOrder: boolean;
};

const needsYou = (s: ReturnType<typeof offerState>) => s.canPay || s.gate?.state === "incorrect_unacked";

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

export function ProposalsManager({ initialProposals, initialStatus = "all" }: { initialProposals: ProposalItem[]; initialStatus?: TabKey }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalItem[]>(initialProposals);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TabKey>(tabFromParam(initialStatus));
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
        const base = offerState({ ...item.proposal, hasOpenOrder: item.hasOpenOrder, gate: item.gate }, offer);
        // A taken-down project's offers are view only: no pay, edit or withdraw, and they leave the Waiting / To pay groups.
        const down = Boolean(item.project?.takenDown);
        const open = !base.lapsed && ["sent", "interview_scheduled", "accepted", "processing"].includes(item.proposal.status);
        const state = down ? { ...base, canPay: false, canEdit: false, canWithdraw: false, canSendNew: false, ...(open ? { label: "View only · taken down", tone: "closed" as const } : {}) } : base;
        return { item, offer, state, down };
      })
        // Offers waiting on your payment, or on you to confirm a corrected CGPA, come first: they are the only rows that need you.
        .sort((a, b) => Number(needsYou(b.state)) - Number(needsYou(a.state))),
    [proposals],
  );

  const projectOptions = Array.from(new Map(proposals.filter((p) => p.project).map((p) => [p.project!.id, p.project!.projectName])).entries());

  // The same counter the hire strip, the dashboard and the page header use.
  const counterRows = rows.map((r) => counterRow(r.item.proposal.status, r.state, r.down));
  const counts = proposalCounts(counterRows);

  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(({ item, offer, state, down }) => {
    // Project, role or the initials shown - never a hidden name.
    const hay = `${item.project?.projectName ?? ""} ${offer.roleTitle} ${nameOf(item)}`.toLowerCase();
    if (needle && !hay.includes(needle)) return false;
    if (!inTab(statusFilter, state.bucket, down)) return false;
    if (projectFilter !== "all" && item.proposal.projectId !== projectFilter) return false;
    return true;
  });
  // A search or project filter narrows within a tab; the tab itself is not a "filter" that can be cleared.
  const narrowing = Boolean(needle) || projectFilter !== "all";
  const filtering = narrowing || statusFilter !== "all";

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
      ...(state.canWithdraw ? [{ label: state.gate?.state === "incorrect_unacked" ? "Withdraw proposal" : "Withdraw offer", onSelect: () => setWithdrawTarget(item), icon: <X />, destructive: true }] : []),
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

  // One counter feeds every number here (proposalCounts). Waiting, Verifying, To pay, Hired and Closed are always
  // listed, even at 0, so every state has a visible name; drafts and view only appear when there are some.
  const tabs: { key: TabKey; count: number }[] = [
    { key: "all", count: counts.all },
    { key: "open", count: counts.awaiting },
    ...(counts.drafts > 0 ? [{ key: "draft" as const, count: counts.drafts }] : []),
    { key: "verifying", count: counts.verifying ?? 0 },
    // Accepted offers only; running placements' monthly dues are on Orders,
    // so this is not called "payment due" beside the dashboard's count (QA-123).
    { key: "accepted", count: counts.accepted },
    ...(counts.viewOnly ? [{ key: "viewonly" as const, count: counts.viewOnly }] : []),
    { key: "hired", count: counts.hired },
    { key: "closed", count: counts.closed },
  ];
  const closedLine = statusFilter === "closed" ? closedSummary(closedBreakdown(counterRows)) : "";
  // A handful of offers reads at a glance; search only earns its place on a longer list.
  const showTools = proposals.length > 5;

  return (
    <div>
      <div className="mb-4">
        <TakedownBanner
          projects={Array.from(new Map(proposals.filter((p) => p.project?.takenDown).map((p) => [p.project!.id, { id: p.project!.id, name: p.project!.projectName }])).values())}
        />
      </div>
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
      <div role="group" aria-label="Show proposals" aria-describedby="proposal-tab-explainer" className="flex flex-wrap gap-x-3 border-b border-ink-100 sm:gap-x-7">
        {tabs.map((t) => {
          const on = statusFilter === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              aria-label={`${TAB_LABEL[t.key].label}, ${t.count}`}
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
              <span aria-hidden className="sm:hidden">{TAB_LABEL[t.key].short}</span>
              <span aria-hidden className="max-sm:hidden">{TAB_LABEL[t.key].label}</span>
              <span aria-hidden className={cn("nums", on ? "text-ink-900" : "text-ink-600")}>{t.count}</span>
            </button>
          );
        })}
      </div>
      {/* What the open tab holds, in one line: a tab at 0 beside an All of 2 means the two sit in another tab. */}
      <p id="proposal-tab-explainer" aria-live="polite" className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-700">
        {TAB_EXPLAINER[statusFilter]}
        {closedLine ? <span className="nums block text-ink-600">{closedLine}</span> : null}
      </p>

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
            title={narrowing ? "No proposals here" : TAB_EMPTY[statusFilter].title}
            body={narrowing ? "Nothing fits this search and status." : TAB_EMPTY[statusFilter].body}
            who={narrowing ? "You - clear the search or project filter" : undefined}
          />
          {narrowing ? (
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
          {filtered.slice(0, shown).map(({ item, offer, state, down }) => {
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
            // A verifying or expired offer is still status "accepted" but is not to pay: it keeps its own tone.
            const chipTone = item.proposal.status === "hired" ? "paid" : state.canPay || (item.proposal.status === "accepted" && !state.verifying && state.expiredReason === null) ? "new" : state.tone;
            // A long label wraps inside its column instead of running into the price beside it.
            const pill = (
              <Pill tone={chipTone} className={cn("max-w-full text-left leading-snug", state.label.length > 24 ? "rounded-xl" : "whitespace-nowrap")}>
                {state.label}
              </Pill>
            );
            // Taken-down project: the offer can be viewed, never acted on.
            const closedLike = state.tone === "closed" || down;
            const closed = state.tone === "closed";
            const label = "text-[11px] font-semibold uppercase tracking-wider text-text-subtle";
            // The note under a card that needs more than a pill: CGPA being confirmed, a correction to confirm, an expired offer.
            const gate = down ? null : state.gate;
            const sendNew = !down && state.canSendNew ? `/employer/send-proposal?intern=${encodeURIComponent(item.proposal.internId)}&project=${encodeURIComponent(item.proposal.projectId)}` : null;
            const note = gate || sendNew ? { gate, sendNew } : null;
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
                  {down ? <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-700"><TakedownBadge /> <span>{TAKEN_DOWN_SHORT}</span></p> : null}
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
                {note ? (
                  <div
                    className={cn(
                      "relative z-10 col-span-2 flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:order-last lg:col-span-full",
                      note.gate?.state === "incorrect_unacked" ? "bg-info-soft" : note.gate ? "bg-accent-100/60" : "bg-ink-50",
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2.5 text-sm leading-relaxed text-ink-800">
                      {note.gate && note.gate.state !== "incorrect_unacked" ? <Hourglass className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden /> : null}
                      <p className="min-w-0 text-pretty">
                        {note.sendNew && state.expiredReason && EXPIRED_CARD_NOTE[state.expiredReason] ? EXPIRED_CARD_NOTE[state.expiredReason] : state.next}
                        {note.gate && note.gate.state !== "incorrect_unacked" && note.gate.dueBy ? (
                          <span className="nums mt-0.5 block font-medium text-ink-900">
                            {note.gate.state === "overdue" ? "Was due by" : "Due by"} {formatIst(note.gate.dueBy)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:w-60">
                      {note.gate?.state === "incorrect_unacked" ? <CgpaAckButton proposalId={item.proposal.id} /> : null}
                      {note.sendNew ? (
                        <Link href={note.sendNew} className={buttonClass({ block: true, className: "min-h-11" })}>
                          <Send className="size-4" aria-hidden />
                          Send a new proposal
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {/* Above the stretched link, so these stay clickable. */}
                <div className="relative z-10 col-span-2 flex items-center gap-3 border-t border-ink-100 pt-3 lg:col-span-1 lg:border-0 lg:pt-0">
                  {/* One visible action, chosen by the state (QA-120); the menu holds the rest. */}
                  <div className="min-w-0 max-sm:flex-1 [&_a]:rounded-xl [&_button]:rounded-xl [&_button]:max-sm:w-full [&_a]:max-sm:w-full lg:w-36 [&_button]:lg:w-full [&_a]:lg:w-full">
                    {state.canPay ? (
                      <Link href="/employer/checkout" className={buttonClass({ variant: "primary" })}>
                        <CreditCard className="size-4" aria-hidden />
                        Pay now
                      </Link>
                    ) : closedLike ? (
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
