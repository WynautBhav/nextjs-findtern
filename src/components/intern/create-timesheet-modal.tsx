"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarPlus, Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { buttonClass } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Starts the next timesheet of one hired internship.
 *
 * The server picks the period (the earliest one of the engagement that has
 * started and is not on a sheet yet); the page works the same rule out in
 * advance and passes it in as `period`, so the dialog says exactly what
 * will open. On success the new sheet opens for editing, as legacy did.
 */
export function CreateTimesheetModal({
  proposalId,
  roleTitle,
  company,
  period,
  className,
}: {
  proposalId: string;
  roleTitle: string;
  company: string;
  /** "18 Oct – 17 Nov 2026", the period that will open. */
  period: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await csrfFetch("/api/intern/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; timesheet?: { id?: string }; timesheetId?: string };
      if (!res.ok) {
        setErrorMsg(data.error || "Could not start the timesheet. Try again.");
        return;
      }
      setOpen(false);
      const id = data.timesheet?.id;
      router.push(id ? `/intern/timesheets?sheet=${encodeURIComponent(id)}` : `/intern/timesheets?proposalId=${encodeURIComponent(proposalId)}`);
      router.refresh();
    } catch {
      setErrorMsg("Could not reach Findtern. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErrorMsg("");
          setOpen(true);
        }}
        className={className ?? buttonClass({ variant: "primary", size: "md" })}
      >
        <CalendarPlus className="size-4" aria-hidden />
        New timesheet
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a timesheet</DialogTitle>
            <DialogDescription>
              Periods follow your internship month by month from your joining date. Mark each day,
              then send it to your manager once every day has a status.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-5 pt-1">
            <dl className="divide-y divide-ink-100 rounded-apple-lg border border-ink-200/80 bg-ink-50/60 px-4">
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-sm text-ink-600">Internship</dt>
                <dd className="min-w-0 text-right text-sm font-medium text-ink-900">
                  {roleTitle}
                  <span className="block text-xs font-normal text-ink-600">{company}</span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-sm text-ink-600">Period</dt>
                <dd className="nums text-right text-sm font-semibold text-ink-900">{period}</dd>
              </div>
            </dl>

            {errorMsg ? (
              <p role="alert" className="flex items-start gap-2 rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {errorMsg}
              </p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
              <button type="button" onClick={() => setOpen(false)} className={buttonClass({ variant: "light", size: "md" })}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className={buttonClass({ variant: "primary", size: "md" })}>
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Start timesheet
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
