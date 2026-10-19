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

  const [selectedProposalId, setSelectedProposalId] = useState(proposals[0]?.id || "");

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
        // No month: the server opens the earliest engagement period that
        // has started and has no timesheet yet.
        body: JSON.stringify({ proposalId: selectedProposalId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(
          data.error || (res.status === 409 ? "A timesheet for this period already exists." : "Failed to create timesheet."),
        );
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
          "apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-800"
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
              Opens the next month of your internship, counted from your joining date (for example
              18 Sep to 17 Oct). Mark each day as it happens and send it once the period ends.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            {errorMsg && (
              <div className="rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                {errorMsg}
              </div>
            )}

            {/* Engagement / Proposal selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-800">
                Active Engagement <span className="text-rose-500">*</span>
              </label>
              {proposals.length === 1 ? (
                <div className="rounded-[10px] border border-ink-200 bg-ink-50/70 p-3 text-xs">
                  <p className="font-semibold text-ink-900">{proposals[0].companyName}</p>
                  {proposals[0].roleTitle && (
                    <p className="text-text-subtle">{proposals[0].roleTitle}</p>
                  )}
                </div>
              ) : (
                <select
                  value={selectedProposalId}
                  onChange={(e) => setSelectedProposalId(e.target.value)}
                  className="apple-spring w-full rounded-[10px] border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.companyName} {p.roleTitle ? `(${p.roleTitle})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] border border-ink-200 px-3.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
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
