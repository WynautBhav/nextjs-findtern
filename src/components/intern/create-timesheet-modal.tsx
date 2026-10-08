"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, Plus } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AcceptedProposalOption {
  id: string;
  companyName: string;
  roleTitle?: string;
}

export function CreateTimesheetModal({
  proposals,
  className,
}: {
  proposals: AcceptedProposalOption[];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [selectedProposalId, setSelectedProposalId] = useState(proposals[0]?.id || "");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProposalId) {
      setErrorMsg("Please select an engagement/company.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await csrfFetch("/api/intern/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: selectedProposalId,
          month: selectedMonth,
          status: "draft",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          setErrorMsg("A timesheet for this month already exists.");
        } else {
          setErrorMsg(data.error || "Failed to create timesheet.");
        }
        return;
      }

      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (proposals.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrorMsg("");
          setOpen(true);
        }}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99]"
        }
      >
        <Plus className="size-3.5" />
        New Monthly Timesheet
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-5 text-brand-600" />
              Start New Timesheet
            </DialogTitle>
            <DialogDescription>
              Initialize a monthly log for your engagement. You can log hours daily and submit once
              the period concludes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            {errorMsg && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                {errorMsg}
              </div>
            )}

            {/* Engagement / Proposal selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-800">
                Active Engagement <span className="text-rose-500">*</span>
              </label>
              {proposals.length === 1 ? (
                <div className="rounded-lg border border-sand-200 bg-sand-50/70 p-3 text-xs">
                  <p className="font-semibold text-ink-900">{proposals[0].companyName}</p>
                  {proposals[0].roleTitle && (
                    <p className="text-text-subtle">{proposals[0].roleTitle}</p>
                  )}
                </div>
              ) : (
                <select
                  value={selectedProposalId}
                  onChange={(e) => setSelectedProposalId(e.target.value)}
                  className="w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                >
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.companyName} {p.roleTitle ? `(${p.roleTitle})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Month selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-800">
                Billing / Work Month <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="month"
                  required
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full rounded-lg border border-sand-300 px-3 py-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-text-subtle">
                A calendar month period will be created with day-by-day hour entries ready for logging.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-sand-300 px-3.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-sand-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                Initialize Period
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
