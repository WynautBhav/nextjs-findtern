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
import { formatCurrency, formatPerHire, formatRate } from "@/lib/format";
import type { CandidateProfile } from "@/lib/employer-candidates";
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
}: {
  employerId: string;
  initialCartLines: CartLineItem[];
  initialStagedLines: CartLineItem[];
  currency?: Currency;
}) {
  const router = useRouter();
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
          slot1: new Date(slot1).toISOString(),
          slot2: slot2 ? new Date(slot2).toISOString() : undefined,
          slot3: slot3 ? new Date(slot3).toISOString() : undefined,
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
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
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
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "cart"
                ? "bg-brand-700 text-white shadow-2xs"
                : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
            }`}
          >
            <ShoppingCart className="size-3.5" />
            <span>Shortlisted ({cartLines.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("checkout")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "checkout"
                ? "bg-brand-700 text-white shadow-2xs"
                : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
            }`}
          >
            <CreditCard className="size-3.5" />
            <span>Ready for Hire ({stagedLines.length})</span>
          </button>
        </div>

        {projectOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
              Project:
            </span>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="h-9 rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 outline-none focus:border-brand-600"
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
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink-50 text-ink-400">
              <ShoppingCart className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-ink-900">Your cart is empty</h3>
            <p className="mt-1 text-xs text-text-subtle">
              Shortlist candidates from your dashboard or candidate search to book meetings and send hiring proposals.
            </p>
            <div className="mt-5">
              <Link
                href="/employer/candidates"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Browse Candidates
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              {displayedCartLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs transition-all hover:border-brand-200 hover:shadow-xs"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3.5">
                      <span className="grid size-11 place-items-center rounded-xl bg-brand-100 text-sm font-bold text-brand-800 shrink-0">
                        {line.candidate.fullName.charAt(0).toUpperCase()}
                      </span>

                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-ink-900">
                          {line.candidate.fullName}
                        </h4>

                        <p className="mt-0.5 text-xs text-text-subtle">
                          Project: <strong className="text-ink-800">{line.projectName}</strong>
                          {line.candidate.location ? ` · ${line.candidate.location}` : ""}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {line.candidate.skills.slice(0, 5).map((s) => (
                            <span
                              key={s}
                              className="rounded-md bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-700"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="text-right sm:self-start shrink-0">
                      <div className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-2xs font-bold text-brand-800 border border-brand-200/60">
                        <Sparkles className="size-3 fill-brand-600 text-brand-600" />
                        <span>Score: {line.candidate.score.toFixed(1)}</span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-ink-900">
                        {formatRate(line.hourlyRateMinor, currency)}
                      </p>
                      <p className="text-2xs text-text-subtle">
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
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 border border-brand-200/80 px-3.5 py-1.5 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-100"
                      >
                        <Video className="size-3.5" />
                        <span>Book Meeting</span>
                      </button>

                      <Link
                        href={`/employer/send-proposal?intern=${encodeURIComponent(line.candidate.id)}&project=${encodeURIComponent(line.projectId)}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-800 transition-colors hover:bg-ink-50"
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
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-60"
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
                        className="grid size-8 place-items-center rounded-xl border border-ink-200 text-ink-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 py-3 text-xs font-semibold text-white shadow-2xs hover:bg-brand-800 disabled:opacity-60"
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
            <aside className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-4 lg:sticky lg:top-8 lg:self-start">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                Cart Summary
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-ink-600">
                  <span>Candidates Shortlisted</span>
                  <span className="font-semibold text-ink-900">{cartLines.length}</span>
                </div>
                <div className="flex justify-between text-ink-600">
                  <span>Staged for Hire</span>
                  <span className="font-semibold text-emerald-700">{stagedLines.length}</span>
                </div>
              </div>

              <div className="border-t border-ink-100 pt-3">
                <p className="text-2xs text-text-subtle leading-relaxed">
                  Booking an interview or sending a proposal incurs ₹0 charge. Platform and per-hire fees are only charged upon confirming candidate hire.
                </p>
              </div>

              {stagedLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("checkout")}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
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
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink-50 text-ink-400">
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800"
              >
                Back to Shortlist
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-900">
                  <Sparkles className="size-4 text-brand-700" />
                  <span>Staged Candidates Ready for Hire Confirmation</span>
                </div>
                <p className="mt-1 text-2xs text-brand-800 leading-relaxed">
                  Review candidates below. Clicking proceed to payment launches Razorpay secure checkout for invoice activation.
                </p>
              </div>

              {displayedStagedLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-2xl border border-ink-100 bg-white p-4.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-brand-100 text-xs font-bold text-brand-800">
                        {line.candidate.fullName.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-ink-900">{line.candidate.fullName}</h4>
                        <p className="text-2xs text-text-subtle">Project: {line.projectName}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-bold text-brand-800">
                        {formatPerHire(line.perHireMinor, currency)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemove(line, "checkout")}
                        disabled={busyId === line.id}
                        className="text-2xs text-rose-600 hover:underline pt-0.5"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Checkout Pricing Sidebar */}
            <aside className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-4 lg:sticky lg:top-8 lg:self-start">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                Order Summary
              </h3>

              <div className="space-y-2 text-xs border-b border-ink-100 pb-3">
                <div className="flex justify-between text-ink-600">
                  <span>Hires Staged</span>
                  <span className="font-semibold text-ink-900">{stagedLines.length}</span>
                </div>
                <div className="flex justify-between text-ink-600">
                  <span>Per-Hire Placement</span>
                  <span className="font-semibold text-ink-900">
                    {formatCurrency(totalPerHireMinor, currency)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-baseline text-sm font-bold text-ink-900">
                <span>Total Payable</span>
                <span className="text-brand-800 text-base">
                  {formatCurrency(totalPerHireMinor, currency)}
                </span>
              </div>

              <Link
                href="/employer/checkout"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition-colors"
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
                ? `Book Meeting with ${meetingCandidate.candidate.fullName}`
                : "Schedule Interview"}
            </DialogTitle>
            <DialogDescription>
              Propose up to 3 date and time slots. The candidate will confirm their preferred slot.
            </DialogDescription>
          </DialogHeader>

          {meetingSuccess ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
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
                  className="mt-1 h-10 w-full rounded-xl border border-ink-200 px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
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
                  className="mt-1 h-10 w-full rounded-xl border border-ink-200 px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
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
                  className="mt-1 h-10 w-full rounded-xl border border-ink-200 px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-800">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-brand-600"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+5:30)</option>
                  <option value="UTC">UTC (Universal Coordinated Time)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setMeetingCandidate(null)}
                  className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === "booking-meeting" || !slot1}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
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
