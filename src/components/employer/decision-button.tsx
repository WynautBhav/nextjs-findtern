"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { csrfFetch } from "@/lib/client-fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function DecisionButton({
  icon,
  label,
  timesheetId,
}: {
  icon: React.ReactNode;
  label: string;
  timesheetId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const isReject = label.toLowerCase().includes("reject");

  async function handleApprove() {
    setLoading(true);
    setErrorMsg("");
    try {
      const id = timesheetId || window.location.pathname.split("/").pop();
      const res = await csrfFetch(`/api/timesheets/${id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Failed to approve timesheet");
      }
    } catch {
      setErrorMsg("Network error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setErrorMsg("Please provide a reason for the candidate to review.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const id = timesheetId || window.location.pathname.split("/").pop();
      const res = await csrfFetch(`/api/timesheets/${id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected", reason: rejectReason.trim() }),
      });
      if (res.ok) {
        setRejectModalOpen(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Failed to reject timesheet");
      }
    } catch {
      setErrorMsg("Network error occurred");
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    if (isReject) {
      setErrorMsg("");
      setRejectReason("");
      setRejectModalOpen(true);
    } else {
      handleApprove();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`apple-spring apple-pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] px-4 text-xs font-semibold shadow-2xs ${
          isReject
            ? "border border-red-200 bg-red-50/50 text-red-700 hover:bg-red-100/70"
            : "bg-brand-700 text-white hover:bg-brand-800"
        } disabled:opacity-60`}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
        <span>{loading ? "Processing…" : label}</span>
      </button>

      {errorMsg && !rejectModalOpen && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="size-3 shrink-0" />
          <span>{errorMsg}</span>
        </p>
      )}

      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Timesheet</DialogTitle>
            <DialogDescription>
              State what needs correction. The intern will receive this feedback and can edit and resubmit their hours.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRejectSubmit} className="space-y-4 pt-2">
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-[10px] bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label htmlFor="reason" className="block text-xs font-semibold text-ink-800">
                Reason for Rejection *
              </label>
              <textarea
                id="reason"
                rows={4}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Please correct the hours for Wednesday 12th - total should be 4 hours instead of 8."
                className="apple-spring mt-1.5 min-h-11 w-full rounded-[10px] border border-ink-200 p-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="apple-spring apple-pressable min-h-11 rounded-[10px] border border-ink-200 bg-white px-4 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !rejectReason.trim()}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
