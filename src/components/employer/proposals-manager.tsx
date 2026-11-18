"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, CreditCard, Eye, Hourglass, Loader2, Pencil, RotateCcw, Search, Send, TriangleAlert, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatIst, formatMoney } from "@/lib/format";
import type { CgpaGate } from "@/lib/cgpa-verification";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { EmptyScene, FilterTabs, Pill, type Tone } from "@/components/app/primitives";
import { LeadStat } from "@/components/app/stat";
import { RowMenu, type RowMenuItem } from "@/components/app/row-menu";
import { ProposalAvatar } from "@/components/employer/proposal-avatar";
import type { PresenceLabel } from "@/lib/presence";
import { buttonClass } from "@/components/ui/button";
import type { EmployerProposal } from "@/lib/employer-proposal-view";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseOffer } from "@/lib/offer";
import { counterRow, EXPIRED_CARD_NOTE, offerState } from "@/components/employer/proposal-state";
import { closedBreakdown, proposalCounts } from "@/components/employer/proposal-bucket";
import { closedSummary, inTab, TAB_EMPTY, TAB_EXPLAINER, TAB_LABEL, tabFromParam, type TabKey } from "@/components/employer/proposal-tabs";
import { daysUntil, stageTrail } from "@/components/employer/proposal-trail";
import { StageTrail } from "@/components/employer/proposal-trail-view";
import { StageFunnel } from "@/components/employer/proposal-detail/stage-funnel";
import { CgpaAckButton } from "@/components/employer/proposal-actions";
import { btnOutline, searchFieldClass } from "@/components/employer/proposal-ui";
import { cn } from "@/lib/utils";
import { TakedownBadge } from "@/components/employer/takedown-badge";
import { TakedownBanner } from "@/components/employer/takedown-banner";
import { TAKEN_DOWN_SHORT } from "@/components/employer/takedown-ui";

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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

  // The funnel: how far the offers sent got. Drafts were never sent; every accepted offer (paid or not) counts as accepted.
  const sentRows = rows.filter((r) => r.item.proposal.status !== "draft");
  const acceptedN = sentRows.filter((r) => ["accepted", "processing", "hired"].includes(r.item.proposal.status)).length;
  const paidN = sentRows.filter((r) => r.item.proposal.status === "hired").length;

  // The one lead figure: what needs the employer, else what they are waiting on, else what is done.
  const payable = rows.filter((r) => r.state.canPay).length;
  const confirming = rows.filter((r) => !r.down && r.state.gate?.state === "incorrect_unacked").length;
  const mine = payable + confirming;
  const lead =
    mine > 0
      ? {
          label: "Needs you",
          value: mine,
          tone: "signal" as const,
          note: payable > 0 ? `${plural(payable, "accepted offer")} to pay. Names and contact details unlock once a hire is paid.` : `${plural(confirming, "corrected CGPA")} to confirm before you can pay.`,
          action: payable > 0 ? { label: "Pay now", href: "/employer/checkout" } : undefined,
        }
      : counts.awaiting > 0
        ? (() => {
            const waiting = rows
              .filter((r) => r.state.bucket === "open" && !r.down)
              .map((r) => ({ who: nameOf(r.item), days: daysUntil(r.offer.startDate) }))
              .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
            const first = waiting[0];
            const names = waiting.slice(0, 3).map((w) => w.who);
            const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
            const more = waiting.length > 3 ? ` and ${waiting.length - 3} more` : "";
            const closes = first?.days && first.days > 0 ? ` ${waiting.length > 1 ? `${first.who}'s` : "The"} offer closes first, in ${plural(first.days, "day")}.` : "";
            return {
              label: "Waiting on a reply",
              value: counts.awaiting,
              tone: "ink" as const,
              note: `${list}${more} ${waiting.length === 1 ? "has" : "have"} not answered yet.${closes}`,
              action: undefined,
            };
          })()
        : (counts.verifying ?? 0) > 0
          ? { label: "CGPA being confirmed", value: counts.verifying ?? 0, tone: "ink" as const, note: "Findtern confirms it, usually in 24-48 h. You can pay once it is done.", action: undefined }
          : counts.hired > 0
            ? { label: "Hired", value: counts.hired, tone: "brand" as const, note: "Paid and placed. Timesheets run monthly from each start date.", action: { label: "Open timesheets", href: "/employer/timesheets" } }
            : null;

  return (
    <div>
      <div className="mb-4">
        <TakedownBanner
          projects={Array.from(new Map(proposals.filter((p) => p.project?.takenDown).map((p) => [p.project!.id, { id: p.project!.id, name: p.project!.projectName }])).values())}
        />
      </div>

      {/* The page's one lead figure beside where the offers got to (Sent > Accepted > Paid) on a single scale. */}
      <div className="grid items-start gap-x-14 gap-y-8 border-b border-ink-200 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        {lead ? <LeadStat label={lead.label} value={lead.value} tone={lead.tone} note={lead.note} action={lead.action} /> : <div />}
        <div>
          <p className="mb-2 text-sm font-medium text-ink-600">How your offers have moved</p>
          <StageFunnel
            stages={[
              { label: "Sent", count: sentRows.length },
              { label: "Accepted", count: acceptedN },
              { label: "Paid", count: paidN },
            ]}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          label="Show proposals"
          tabs={tabs.map((t) => ({ key: t.key, label: TAB_LABEL[t.key].short, count: t.count }))}
          value={statusFilter}
          onChange={(k) => {
            setStatusFilter(k as TabKey);
            setShown(PAGE);
          }}
          className="-ml-3"
        />
        {showTools ? (
          <div className="flex gap-2 sm:w-96">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search proposals</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="Role, project or initials"
                className={cn(searchFieldClass, "pl-9")}
              />
            </label>
            {projectOptions.length > 1 ? (
              <select
                value={projectFilter}
                onChange={(e) => {
                  setProjectFilter(e.target.value);
                  setShown(PAGE);
                }}
                className={cn(searchFieldClass, "w-32 shrink-0 truncate sm:w-40")}
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
      </div>
      {/* What the open tab holds, in one line: a tab at 0 beside an All of 2 means the two sit in another tab. */}
      <p aria-live="polite" className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-700">
        {TAB_EXPLAINER[statusFilter]}
        {closedLine ? <span className="nums block text-ink-600">{closedLine}</span> : null}
      </p>

      {errorMsg ? (
        <p role="alert" className="mt-4 rounded-md border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-ink-900">
          {errorMsg}
        </p>
      ) : null}

      <p className="sr-only" role="status">
        {filtered.length} of {rows.length} proposals
      </p>

      {filtered.length === 0 ? (
        <div className="pt-6">
          <EmptyScene
            title={narrowing ? "No proposals here" : TAB_EMPTY[statusFilter].title}
            body={narrowing ? "Nothing fits this search and status." : TAB_EMPTY[statusFilter].body}
            who={narrowing ? "You - clear the search or project filter" : undefined}
            next={narrowing ? undefined : { label: statusFilter === "closed" || statusFilter === "hired" ? "Find more candidates" : "Browse candidates", href: "/employer/candidates" }}
          />
          {narrowing ? (
            <p className="mt-3">
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
                className={btnOutline}
              >
                <RotateCcw className="size-4" aria-hidden />
                Clear filters
              </button>
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="-mx-3 mt-5 before:mx-3 before:block before:h-px before:bg-ink-200 before:content-['']">
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
            const href = `/employer/proposal/${item.proposal.id}`;
            const title = offer.roleTitle || item.project?.projectName || "Internship";
            const who = nameOf(item);
            const status = item.proposal.status;
            const closed = state.tone === "closed";
            const mineNow = needsYou(state);
            // Amber is for what the employer owes or must confirm; waiting on someone else is neutral; Hired is green.
            const tone: Tone = status === "hired" ? "live" : mineNow ? "waiting" : closed ? "closed" : "neutral";
            const icon =
              status === "hired" ? <Check /> : state.canPay ? <CreditCard /> : state.gate?.state === "incorrect_unacked" ? <TriangleAlert /> : state.verifying ? <Hourglass /> : closed ? <X /> : status === "draft" ? <Pencil /> : <Clock />;
            const n = daysUntil(offer.startDate);
            const clock =
              closed || down || n === null
                ? null
                : state.bucket === "open"
                  ? n > 0
                    ? `${plural(n, "day")} left to reply`
                    : null
                  : state.canPay
                    ? n > 0
                      ? `${plural(n, "day")} left to pay`
                      : null
                    : status === "hired"
                      ? n > 0
                        ? `Starts in ${plural(n, "day")}`
                        : n === 0
                          ? "Starts today"
                          : null
                      : null;
            const trail = stageTrail(
              item.proposal,
              { startDate: offer.startDate },
              { closed: closed && !down, acceptedBeforeClose: status === "accepted" && closed },
              formatDate,
            );
            // The note under a row that needs more than a pill: CGPA being confirmed, a correction to confirm, an expired offer.
            const gate = down ? null : state.gate;
            const sendNew = !down && state.canSendNew ? `/employer/send-proposal?intern=${encodeURIComponent(item.proposal.internId)}&project=${encodeURIComponent(item.proposal.projectId)}` : null;
            const note = gate || sendNew ? { gate, sendNew } : null;
            const menu = menuFor(item, state, href);
            return (
              <li key={item.proposal.id} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-4 px-3 py-5 transition-colors after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-ink-200 after:content-['']  duration-[var(--motion-fast)] hover:bg-ink-200/30 min-[1360px]:grid-cols-[minmax(0,1.15fr)_19rem_10rem_8.5rem_9rem] min-[1360px]:items-center">
                {/* Who: the whole row opens the offer through this link, stretched over it. */}
                <div className="flex min-w-0 items-center gap-3 min-[1360px]:order-1">
                  <ProposalAvatar photoUrl={item.photoUrl} initials={ini === "?" ? "C" : ini} presence={item.presence} className="size-10 text-sm" />
                  <div className="min-w-0">
                    <p className="text-base leading-snug">
                      <Link
                        href={href}
                        className={cn(
                          "break-words font-semibold outline-none after:absolute after:inset-0 after:content-[''] hover:underline hover:decoration-ink-400 hover:underline-offset-4 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-700",
                          closed ? "text-ink-700" : "text-ink-900",
                        )}
                      >
                        {who}
                        <span className="sr-only">, {title}</span>
                      </Link>
                    </p>
                    <p className="break-words text-sm text-ink-700">{title}</p>
                    {item.project ? <p className="break-words text-xs text-ink-600">{item.project.projectName}</p> : null}
                    {down ? (
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-700">
                        <TakedownBadge /> <span>{TAKEN_DOWN_SHORT}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Money: the monthly price in display figures. */}
                <div className="text-right min-[1360px]:order-4">
                  {money ? (
                    <>
                      <p className="nums font-display text-lg font-semibold leading-tight text-ink-900">{money.amount}</p>
                      <p className="nums text-xs text-ink-600">
                        {money.per}
                        {ft ? "" : ` · ${plural(offer.months, "month")}`}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-ink-700">{ft ? "CTC not set" : "Price not set"}</p>
                  )}
                </div>

                {/* Stage trail with dates. */}
                <StageTrail stages={trail} attention={mineNow} className="col-span-2 min-[1360px]:order-2 min-[1360px]:col-span-1" />

                {/* Where it stands, and the clock. */}
                <div className="min-w-0 min-[1360px]:order-3">
                  <Pill tone={tone} icon={icon} className="max-w-full text-left leading-snug">
                    {state.label}
                  </Pill>
                  {clock ? <p className="nums mt-1 text-xs text-ink-700">{clock}</p> : null}
                </div>

                {/* Above the stretched link, so these stay clickable. */}
                <div className="relative z-10 flex items-center justify-end gap-1.5 min-[1360px]:order-5">
                  {state.canPay ? (
                    <Link href="/employer/checkout" className={btnOutline}>
                      Pay now
                    </Link>
                  ) : null}
                  {menu.length > 0 ? <RowMenu label={`More actions for ${title}, ${who}`} items={menu} className="touch:size-11" /> : null}
                </div>

                {note ? (
                  <div className="relative z-10 col-span-full flex flex-col gap-3 text-sm text-ink-800 sm:flex-row sm:items-center sm:justify-between min-[1360px]:order-6 min-[1360px]:pl-[3.25rem]">
                    <p className="flex min-w-0 items-start gap-2 text-pretty leading-relaxed">
                      {note.gate && note.gate.state !== "incorrect_unacked" ? <Hourglass className="mt-0.5 size-4 shrink-0 text-ink-600" aria-hidden /> : null}
                      <span>
                        {note.sendNew && state.expiredReason && EXPIRED_CARD_NOTE[state.expiredReason] ? EXPIRED_CARD_NOTE[state.expiredReason] : state.next}
                        {note.gate && note.gate.state !== "incorrect_unacked" && note.gate.dueBy ? (
                          <span className="nums mt-0.5 block font-medium text-ink-900">
                            {note.gate.state === "overdue" ? "Was due by" : "Due by"} {formatIst(note.gate.dueBy)}
                          </span>
                        ) : null}
                      </span>
                    </p>
                    <div className="flex shrink-0 flex-col gap-2 sm:w-60">
                      {note.gate?.state === "incorrect_unacked" ? <CgpaAckButton proposalId={item.proposal.id} /> : null}
                      {note.sendNew ? (
                        <Link href={note.sendNew} className={btnOutline}>
                          <Send className="size-4" aria-hidden />
                          Send a new proposal
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > shown ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-6">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className={btnOutline}>
            Show {Math.min(PAGE, filtered.length - shown)} more
          </button>
          <p className="nums text-sm text-ink-600">
            Showing {shown} of {filtered.length}
          </p>
        </div>
      ) : filtering && filtered.length > 0 ? (
        <p className="mt-3 text-sm text-ink-600">
          Showing <span className="nums font-semibold text-ink-900">{filtered.length}</span> of <span className="nums">{proposals.length}</span>
        </p>
      ) : null}

      <Dialog open={Boolean(withdrawTarget)} onOpenChange={(open) => !open && !busy && setWithdrawTarget(null)}>
        <DialogContent className="rounded-lg sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-semibold text-ink-900">Withdraw this offer?</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-700">
              {withdrawTarget?.proposal.status === "accepted"
                ? "The candidate already accepted. Withdrawing tells them it won't go ahead. This can't be undone."
                : "The candidate can no longer accept it, and they are told. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          {withdrawTarget ? (
            <p className="rounded-md bg-ink-100 px-4 py-3 text-sm text-ink-900">
              <span className="font-semibold">{parseOffer(withdrawTarget.proposal.offerDetails).roleTitle || "Internship"}</span>
              {" · "}
              {nameOf(withdrawTarget)}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setWithdrawTarget(null)} disabled={busy} className={btnOutline}>
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
