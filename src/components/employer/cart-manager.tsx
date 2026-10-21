"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Send,
  ShoppingCart,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { EmptyState } from "@/components/layout/page-header";
import { formatPerHire, formatRate } from "@/lib/format";
import { displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import { TIMEZONES } from "@/lib/timezones";
import { isQuarterHourWall, suggestedSlots } from "@/lib/employer-interview-rules";
import type { Currency } from "@/lib/employer-pricing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type CartLineItem = {
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string | null;
  candidate: CandidateProfile;
  hourlyRateMinor: number;
  perHireMinor: number;
  /** A proposal already out to this candidate (any project), if any. */
  openProposalId?: string | null;
};

export function CartManager({
  employerId,
  initialCartLines,
  currency = "INR",
  nameUnlockedIds = [],
  unlockAll = false,
  awaitingPayment = 0,
}: {
  employerId: string;
  initialCartLines: CartLineItem[];
  currency?: Currency;
  /** Intern ids this employer hired - the only ones whose full name shows. */
  nameUnlockedIds?: string[];
  /** Admin "View as": every name shows. */
  unlockAll?: boolean;
  /** Accepted offers waiting for payment at checkout. */
  awaitingPayment?: number;
}) {
  const router = useRouter();
  const unlocked = new Set(nameUnlockedIds);
  const nameOf = (line: CartLineItem) =>
    displayNameOf(line.candidate, unlockAll || unlocked.has(line.candidate.id));
  const [cartLines, setCartLines] = useState<CartLineItem[]>(initialCartLines);
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // Meeting Dialog state
  const [meetingCandidate, setMeetingCandidate] = useState<CartLineItem | null>(null);
  const [slot1, setSlot1] = useState("");
  const [slot2, setSlot2] = useState("");
  const [slot3, setSlot3] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [meetingSuccess, setMeetingSuccess] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const projectsMap = new Map<string, string>();
  cartLines.forEach((l) => projectsMap.set(l.projectId, l.projectName));
  const projectOptions = Array.from(projectsMap.entries());

  const displayedCartLines = selectedProject === "all"
    ? cartLines
    : cartLines.filter((l) => l.projectId === selectedProject);

  async function handleRemove(item: CartLineItem) {
    setBusyId(item.id);
    setErrorMsg("");

    try {
      const res = await csrfFetch("/api/employer/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          internId: item.candidate.id,
          projectId: item.projectId,
          listType: "cart",
        }),
      });

      if (res.ok) {
        setCartLines((prev) => prev.filter((l) => l.id !== item.id));
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Failed to remove candidate");
      }
    } catch {
      setErrorMsg("Network error occurred");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBookMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!meetingCandidate) return;

    if (!slot1 || !slot2 || !slot3) {
      setErrorMsg("Offer three time slots so the candidate can choose.");
      return;
    }
    if (![slot1, slot2, slot3].every(isQuarterHourWall)) {
      setErrorMsg("Slots start on the hour or at :15, :30 or :45.");
      return;
    }
    if (new Set([slot1, slot2, slot3]).size !== 3) {
      setErrorMsg("Offer three different times.");
      return;
    }

    setBusyId("booking-meeting");
    setErrorMsg("");

    try {
      const res = await csrfFetch(`/api/employer/${employerId}/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internId: meetingCandidate.candidate.id,
          projectId: meetingCandidate.projectId,
          // Wall-clock times in the chosen zone; the server converts them.
          slot1,
          slot2,
          slot3,
          timezone,
        }),
      });

      if (res.ok) {
        setMeetingSuccess(true);
        setTimeout(() => {
          setMeetingCandidate(null);
          setMeetingSuccess(false);
          setSlot1("");
          setSlot2("");
          setSlot3("");
        }, 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Failed to schedule interview");
      }
    } catch {
      setErrorMsg("Network error occurred");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Row 62: there is no hiring straight from the shortlist. A candidate
          is hired by accepting a proposal; accepted offers are paid at
          checkout, one at a time. */}
      {awaitingPayment > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-ink-800">
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
            {awaitingPayment} accepted offer{awaitingPayment === 1 ? " is" : "s are"} waiting for payment.
          </p>
          <Link
            href="/employer/checkout"
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <CreditCard className="size-3.5" aria-hidden />
            Go to checkout
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-b border-ink-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-ink-800">
          <ShoppingCart className="size-4 text-ink-400" aria-hidden />
          Shortlisted ({cartLines.length})
        </h2>

        {projectOptions.length > 0 && (
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor="cart-project" className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-text-subtle">
              Project:
            </label>
            <select
              id="cart-project"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="apple-spring min-h-11 w-full min-w-0 flex-1 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] font-medium text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:w-auto"
            >
              <option value="all">All Projects</option>
              {projectOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {displayedCartLines.length === 0 ? (
        <EmptyState
          title="Your shortlist is empty"
          body="Shortlist candidates from the candidate search to book meetings and send proposals."
          action={{ label: "Browse candidates", href: "/employer/candidates" }}
          who="You - shortlist a candidate"
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {displayedCartLines.map((line) => (
              <div
                key={line.id}
                className="apple-spring rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] hover:border-brand-200"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3.5">
                    <span className="grid size-11 place-items-center rounded-[10px] bg-brand-100 text-sm font-bold text-brand-800 shrink-0">
                      {line.candidate.initials}
                    </span>

                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-ink-900">{nameOf(line)}</h3>
                      <p className="mt-0.5 text-xs text-text-subtle">
                        Project: <strong className="text-ink-800">{line.projectName}</strong>
                        {line.candidate.location ? ` · ${line.candidate.location}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {line.candidate.skills.map((s) => (
                          <span key={s} className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 md:self-start md:text-right">
                    <div className="inline-flex items-center gap-1 rounded-full border border-brand-200/60 bg-brand-50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-800">
                      <Sparkles className="size-3 fill-brand-600 text-brand-600" />
                      <span>Score: {line.candidate.score.toFixed(1)}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold tabular-nums text-ink-900">
                      {formatRate(line.hourlyRateMinor, currency)}
                    </p>
                    {line.perHireMinor > 0 ? (
                      <p className="text-xs tabular-nums text-text-subtle">{formatPerHire(line.perHireMinor, currency)}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Row 66: three suggested quarter-hour slots, an hour
                        // apart, from the nearest quarter hour 15+ min out. Editable.
                        const [a, b, c] = suggestedSlots(Date.now(), timezone);
                        setSlot1(a);
                        setSlot2(b);
                        setSlot3(c);
                        setMeetingCandidate(line);
                        setErrorMsg("");
                        setMeetingSuccess(false);
                      }}
                      className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-brand-200/80 bg-brand-50 px-3.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
                    >
                      <Video className="size-3.5" />
                      <span>Book Meeting</span>
                    </button>

                    {line.openProposalId ? (
                      <Link
                        href={`/employer/proposal/${encodeURIComponent(line.openProposalId)}`}
                        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-xs font-semibold text-ink-800 hover:bg-ink-50"
                      >
                        <Send className="size-3.5" />
                        <span>Proposal sent - view</span>
                      </Link>
                    ) : (
                      <Link
                        href={`/employer/send-proposal?intern=${encodeURIComponent(line.candidate.id)}&project=${encodeURIComponent(line.projectId)}`}
                        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
                      >
                        <Send className="size-3.5" />
                        <span>Send Proposal</span>
                      </Link>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(line)}
                    disabled={busyId === line.id}
                    className="apple-spring apple-pressable grid size-11 place-items-center rounded-[10px] border border-ink-200 text-ink-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    title="Remove from shortlist"
                    aria-label="Remove from shortlist"
                  >
                    {busyId === line.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <aside className="min-w-0 space-y-4 rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] xl:sticky xl:top-8 xl:self-start">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-800">How hiring works</h2>
            <ol className="space-y-2.5 text-xs leading-relaxed text-ink-600">
              <li>1. Book a meeting if you want to talk first.</li>
              <li>2. Send a proposal. The candidate reads it and accepts or declines.</li>
              <li>3. Pay for an accepted offer at checkout - that completes the hire.</li>
            </ol>
            <p className="border-t border-ink-100 pt-3 text-xs leading-relaxed text-text-subtle">
              Meetings and proposals are free. You only pay once a candidate accepts.
            </p>
          </aside>
        </div>
      )}

      {/* Book Meeting Modal */}
      <Dialog
        open={Boolean(meetingCandidate)}
        onOpenChange={(open) => !open && setMeetingCandidate(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {meetingCandidate
                ? `Book Meeting with ${nameOf(meetingCandidate)}`
                : "Schedule Interview"}
            </DialogTitle>
            <DialogDescription>
              Offer three times on the quarter hour. We suggest the next free quarter hour and the
              two hours after it - change any of them. The candidate picks one.
            </DialogDescription>
          </DialogHeader>

          {meetingSuccess ? (
            <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
              <CheckCircle2 className="size-8 text-emerald-600 mx-auto" />
              <h3 className="text-sm font-bold text-emerald-900">Interview Request Sent!</h3>
              <p className="text-xs text-emerald-800">
                The candidate has been notified to pick from your offered slots.
              </p>
            </div>
          ) : (
            <form onSubmit={handleBookMeeting} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-ink-800">
                  Slot 1 *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={slot1}
                  onChange={(e) => setSlot1(e.target.value)}
                  step={900}
                  className="apple-spring mt-1 min-h-11 w-full rounded-[10px] border border-ink-200 px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800">
                  Slot 2 *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={slot2}
                  onChange={(e) => setSlot2(e.target.value)}
                  step={900}
                  className="apple-spring mt-1 min-h-11 w-full rounded-[10px] border border-ink-200 px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800">
                  Slot 3 *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={slot3}
                  onChange={(e) => setSlot3(e.target.value)}
                  step={900}
                  className="apple-spring mt-1 min-h-11 w-full rounded-[10px] border border-ink-200 px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label htmlFor="cart-timezone" className="block text-xs font-semibold text-ink-800">
                  Timezone
                </label>
                <select
                  id="cart-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="apple-spring mt-1 min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  {TIMEZONES.map((option) =>
                    option.group ? (
                      <option key={option.id} value={option.id} disabled>
                        ── {option.label} ──
                      </option>
                    ) : (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setMeetingCandidate(null)}
                  className="apple-spring apple-pressable min-h-11 rounded-[10px] border border-ink-200 bg-white px-4 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === "booking-meeting" || !slot1 || !slot2 || !slot3}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                >
                  {busyId === "booking-meeting" && <Loader2 className="size-3.5 animate-spin" />}
                  <span>Send Interview Request</span>
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
