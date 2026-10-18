"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
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
import { formatCurrency, formatPerHire, formatRate } from "@/lib/format";
import { displayNameOf, type CandidateProfile } from "@/lib/employer-candidates";
import { TIMEZONES } from "@/lib/timezones";
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
};

export function CartManager({
  employerId,
  initialCartLines,
  initialStagedLines,
  currency = "INR",
  nameUnlockedIds = [],
  unlockAll = false,
}: {
  employerId: string;
  initialCartLines: CartLineItem[];
  initialStagedLines: CartLineItem[];
  currency?: Currency;
  /** Intern ids this employer hired - the only ones whose full name shows. */
  nameUnlockedIds?: string[];
  /** Admin "View as": every name shows. */
  unlockAll?: boolean;
}) {
  const router = useRouter();
  const unlocked = new Set(nameUnlockedIds);
  const nameOf = (line: CartLineItem) =>
    displayNameOf(line.candidate, unlockAll || unlocked.has(line.candidate.id));
  const [activeTab, setActiveTab] = useState<"cart" | "checkout">("cart");
  const [cartLines, setCartLines] = useState<CartLineItem[]>(initialCartLines);
  const [stagedLines, setStagedLines] = useState<CartLineItem[]>(initialStagedLines);
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

  // Projects map
  const projectsMap = new Map<string, string>();
  [...cartLines, ...stagedLines].forEach((l) => projectsMap.set(l.projectId, l.projectName));
  const projectOptions = Array.from(projectsMap.entries());

  // Filtered lines
  const displayedCartLines = selectedProject === "all"
    ? cartLines
    : cartLines.filter((l) => l.projectId === selectedProject);

  const displayedStagedLines = selectedProject === "all"
    ? stagedLines
    : stagedLines.filter((l) => l.projectId === selectedProject);

  // Totals
  const totalPerHireMinor = stagedLines.reduce((acc, l) => acc + l.perHireMinor, 0);

  async function handleRemove(item: CartLineItem, fromTab: "cart" | "checkout") {
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
          listType: fromTab,
        }),
      });

      if (res.ok) {
        if (fromTab === "cart") {
          setCartLines((prev) => prev.filter((l) => l.id !== item.id));
        } else {
          setStagedLines((prev) => prev.filter((l) => l.id !== item.id));
        }
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

  async function handleStage(item: CartLineItem) {
    setBusyId(item.id);
    setErrorMsg("");

    try {
      const res = await csrfFetch("/api/employer/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          internId: item.candidate.id,
          projectId: item.projectId,
        }),
      });

      if (res.ok) {
        setCartLines((prev) => prev.filter((l) => l.id !== item.id));
        setStagedLines((prev) => [...prev, item]);
        setActiveTab("checkout");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Failed to move candidate to checkout");
      }
    } catch {
      setErrorMsg("Network error occurred");
    } finally {
      setBusyId(null);
    }
  }

  async function handleStageAll() {
    setBusyId("stage-all");
    setErrorMsg("");

    try {
      const res = await csrfFetch("/api/employer/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stage_all" }),
      });

      if (res.ok) {
        setStagedLines((prev) => [...prev, ...cartLines]);
        setCartLines([]);
        setActiveTab("checkout");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Failed to stage all candidates");
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

    if (!slot1) {
      setErrorMsg("Please select at least one preferred meeting slot.");
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
          slot2: slot2 || undefined,
          slot3: slot3 || undefined,
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

      {/* Tabs Navigation & Project Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("cart")}
            className={`apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-xs font-semibold ${
              activeTab === "cart"
                ? "bg-brand-700 text-white shadow-2xs"
                : "border border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            }`}
          >
            <ShoppingCart className="size-3.5" />
            <span>Shortlisted ({cartLines.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("checkout")}
            className={`apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-xs font-semibold ${
              activeTab === "checkout"
                ? "bg-brand-700 text-white shadow-2xs"
                : "border border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            }`}
          >
            <CreditCard className="size-3.5" />
            <span>Ready for Hire ({stagedLines.length})</span>
          </button>
        </div>

        {projectOptions.length > 0 && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-text-subtle">
              Project:
            </span>
            <select
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

      {/* Main Content Area */}
      {activeTab === "cart" ? (
        displayedCartLines.length === 0 ? (
          <EmptyState
            title="Your cart is empty"
            body="Shortlist candidates from your dashboard or candidate search to book meetings and send hiring proposals."
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
                        <h4 className="text-sm font-bold text-ink-900">
                          {nameOf(line)}
                        </h4>

                        <p className="mt-0.5 text-xs text-text-subtle">
                          Project: <strong className="text-ink-800">{line.projectName}</strong>
                          {line.candidate.location ? ` · ${line.candidate.location}` : ""}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {line.candidate.skills.slice(0, 5).map((s) => (
                            <span
                              key={s}
                              className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 md:self-start md:text-right">
                      <div className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-800 border border-brand-200/60">
                        <Sparkles className="size-3 fill-brand-600 text-brand-600" />
                        <span>Score: {line.candidate.score.toFixed(1)}</span>
                      </div>
                      <p className="mt-1 text-xs font-semibold tabular-nums text-ink-900">
                        {formatRate(line.hourlyRateMinor, currency)}
                      </p>
                      <p className="text-xs tabular-nums text-text-subtle">
                        {formatPerHire(line.perHireMinor, currency)}
                      </p>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMeetingCandidate(line);
                          setErrorMsg("");
                          setMeetingSuccess(false);
                        }}
                        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-brand-50 border border-brand-200/80 px-3.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
                      >
                        <Video className="size-3.5" />
                        <span>Book Meeting</span>
                      </button>

                      <Link
                        href={`/employer/send-proposal?intern=${encodeURIComponent(line.candidate.id)}&project=${encodeURIComponent(line.projectId)}`}
                        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-xs font-semibold text-ink-800 hover:border-ink-300 hover:bg-ink-50"
                      >
                        <Send className="size-3.5" />
                        <span>Send Proposal</span>
                      </Link>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStage(line)}
                        disabled={busyId === line.id}
                        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyId === line.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="size-3.5" />
                        )}
                        <span>Stage for Hire</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemove(line, "cart")}
                        disabled={busyId === line.id}
                        className="apple-spring apple-pressable grid size-11 place-items-center rounded-[10px] border border-ink-200 text-ink-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                        title="Remove from Cart"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleStageAll}
                  disabled={busyId === "stage-all" || cartLines.length === 0}
                  className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-4 text-xs font-semibold text-white shadow-2xs hover:bg-brand-800 disabled:opacity-60"
                >
                  {busyId === "stage-all" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  <span>Move All ({cartLines.length}) to Checkout</span>
                </button>
              </div>
            </div>

            {/* Sidebar Summary */}
            <aside className="min-w-0 rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] space-y-4 xl:sticky xl:top-8 xl:self-start">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                Cart Summary
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-ink-600">
                  <span>Candidates Shortlisted</span>
                  <span className="font-semibold tabular-nums text-ink-900">{cartLines.length}</span>
                </div>
                <div className="flex justify-between text-ink-600">
                  <span>Staged for Hire</span>
                  <span className="font-semibold tabular-nums text-emerald-700">{stagedLines.length}</span>
                </div>
              </div>

              <div className="border-t border-ink-100 pt-3">
                <p className="text-xs text-text-subtle leading-relaxed">
                  Booking an interview or sending a proposal incurs ₹0 charge. Platform and per-hire fees are only charged upon confirming candidate hire.
                </p>
              </div>

              {stagedLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("checkout")}
                  className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[10px] bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <span>Go to Checkout ({stagedLines.length})</span>
                  <ArrowRight className="size-3.5" />
                </button>
              )}
            </aside>
          </div>
        )
      ) : (
        /* Checkout Step */
        displayedStagedLines.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-ink-200/70 bg-white p-12 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-[10px] bg-ink-50 text-ink-400">
              <CreditCard className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-ink-900">No candidates in checkout</h3>
            <p className="mt-1 text-xs text-text-subtle">
              Stage candidates from your cart shortlist above to complete their hire activation.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setActiveTab("cart")}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Back to Shortlist
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              <div className="rounded-[20px] border border-brand-200 bg-brand-50/50 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-900">
                  <Sparkles className="size-4 text-brand-700" />
                  <span>Staged Candidates Ready for Hire Confirmation</span>
                </div>
                <p className="mt-1 text-xs text-brand-800 leading-relaxed">
                  Review candidates below. Clicking proceed to payment launches Razorpay secure checkout for invoice activation.
                </p>
              </div>

              {displayedStagedLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-[20px] border border-ink-200/70 bg-white p-4.5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-[10px] bg-brand-100 text-xs font-bold text-brand-800">
                        {line.candidate.initials}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-ink-900">{nameOf(line)}</h4>
                        <p className="text-xs text-text-subtle">Project: {line.projectName}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-bold tabular-nums text-brand-800">
                        {formatPerHire(line.perHireMinor, currency)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemove(line, "checkout")}
                        disabled={busyId === line.id}
                        className="apple-spring inline-flex min-h-11 items-center text-xs text-rose-600 hover:underline pt-0.5"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Checkout Pricing Sidebar */}
            <aside className="min-w-0 rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] space-y-4 xl:sticky xl:top-8 xl:self-start">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                Order Summary
              </h3>

              <div className="space-y-2 text-xs border-b border-ink-100 pb-3">
                <div className="flex justify-between text-ink-600">
                  <span>Hires Staged</span>
                  <span className="font-semibold tabular-nums text-ink-900">{stagedLines.length}</span>
                </div>
                <div className="flex justify-between text-ink-600">
                  <span>Per-Hire Placement</span>
                  <span className="font-semibold tabular-nums text-ink-900">
                    {formatCurrency(totalPerHireMinor, currency)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-baseline text-sm font-bold text-ink-900">
                <span>Total Payable</span>
                <span className="text-brand-800 text-base tabular-nums">
                  {formatCurrency(totalPerHireMinor, currency)}
                </span>
              </div>

              <Link
                href="/employer/checkout"
                className="apple-spring apple-pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-emerald-600 px-4 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700"
              >
                <CreditCard className="size-4" />
                <span>Proceed to Payment</span>
              </Link>
            </aside>
          </div>
        )
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
              Propose up to 3 date and time slots. The candidate will confirm their preferred slot.
            </DialogDescription>
          </DialogHeader>

          {meetingSuccess ? (
            <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
              <CheckCircle2 className="size-8 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-bold text-emerald-900">Interview Request Sent!</h4>
              <p className="text-xs text-emerald-800">
                The candidate has been notified to pick from your offered slots.
              </p>
            </div>
          ) : (
            <form onSubmit={handleBookMeeting} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-ink-800">
                  Slot 1 (Primary) *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={slot1}
                  onChange={(e) => setSlot1(e.target.value)}
                  className="apple-spring mt-1 min-h-11 w-full rounded-[10px] border border-ink-200 px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800">
                  Slot 2 (Alternative)
                </label>
                <input
                  type="datetime-local"
                  value={slot2}
                  onChange={(e) => setSlot2(e.target.value)}
                  className="apple-spring mt-1 min-h-11 w-full rounded-[10px] border border-ink-200 px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800">
                  Slot 3 (Alternative)
                </label>
                <input
                  type="datetime-local"
                  value={slot3}
                  onChange={(e) => setSlot3(e.target.value)}
                  className="apple-spring mt-1 min-h-11 w-full rounded-[10px] border border-ink-200 px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800">
                  Timezone
                </label>
                <select
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
                  disabled={busyId === "booking-meeting" || !slot1}
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
