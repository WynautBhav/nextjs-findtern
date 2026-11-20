"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyScene, Pill, Surface } from "@/components/app/primitives";
import { buttonVariants } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { LEAVE_BULK_MAX, LEAVE_NOTE_MAX } from "@/lib/college/leave-request";
import type { CollegeLeaveRow } from "@/lib/college/leave-request-read";
import { cn } from "@/lib/utils";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const WHO: Record<string, string> = { college_admin: "Your placement office", admin: "Findtern", system: "Closed automatically", student: "The student" };

type Failure = { id: string; error?: string };

/** The officer's queue: approve or reject one request or many (up to 100), with an optional note the student sees. */
export function LeaveRequestsTable({ initial }: { initial: CollegeLeaveRow[] }) {
  const router = useRouter();
  const pending = useMemo(() => initial.filter((r) => r.status === "requested"), [initial]);
  const decided = useMemo(() => initial.filter((r) => r.status !== "requested"), [initial]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = pending.length > 0 && pending.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < LEAVE_BULK_MAX) n.add(id);
      return n;
    });

  async function decide(ids: string[], action: "approve" | "reject") {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await csrfFetch("/api/college/leave-requests/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, action, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; approved?: number; rejected?: number; failed?: number; results?: Failure[] & { ok?: boolean }[] };
      if (!res.ok) {
        setError(data.error ?? "Could not save. Try again.");
        return;
      }
      const done = (data.approved ?? 0) + (data.rejected ?? 0);
      const failed = data.failed ?? 0;
      const firstError = (data.results as { ok: boolean; error?: string }[] | undefined)?.find((r) => !r.ok)?.error;
      setMessage(`${done} ${action === "approve" ? "approved" : "rejected"}${failed ? `, ${failed} could not be saved${firstError ? ` (${firstError})` : ""}` : ""}.`);
      setSelected(new Set());
      setNote("");
      router.refresh();
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const act = "min-h-11 px-3 text-sm";

  return (
    <div className="space-y-8">
      <section aria-labelledby="pending-h" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="pending-h" className="text-base font-semibold text-ink-900">
            Waiting for you
          </h2>
          {pending.length > 0 ? <Pill tone="waiting">{pending.length}</Pill> : null}
        </div>

        {pending.length === 0 ? (
          <Surface className="p-5">
            <EmptyScene compact title="No leave requests" body="When a student asks to leave your college, the request shows up here." />
          </Surface>
        ) : (
          <>
            <Surface className="space-y-3 p-4">
              <label className="flex items-center gap-2 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(pending.slice(0, LEAVE_BULK_MAX).map((r) => r.id)))}
                  className="size-4"
                />
                Select all{pending.length > LEAVE_BULK_MAX ? ` (first ${LEAVE_BULK_MAX})` : ""}
                <span className="text-ink-500">· {selected.size} selected</span>
              </label>
              <div>
                <label htmlFor="leave-note" className="text-sm font-medium text-ink-800">
                  Note to the student <span className="font-normal text-ink-500">(optional)</span>
                </label>
                <textarea
                  id="leave-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={LEAVE_NOTE_MAX}
                  rows={2}
                  placeholder="Shown to the student with your decision"
                  className="mt-1 block w-full resize-none rounded-apple-sm border border-ink-200 bg-card px-3 py-2 text-sm text-ink-900"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || selected.size === 0} onClick={() => decide([...selected], "approve")} className={cn(buttonVariants({ variant: "primary", size: "md" }), act)}>
                  Approve selected
                </button>
                <button type="button" disabled={busy || selected.size === 0} onClick={() => decide([...selected], "reject")} className={cn(buttonVariants({ variant: "outline", size: "md" }), act)}>
                  Reject selected
                </button>
              </div>
            </Surface>

            <ul className="space-y-3">
              {pending.map((r) => (
                <Surface as="li" key={r.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.name}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="mt-1 size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-ink-900">{r.name}</p>
                      <p className="break-all text-sm text-ink-600">{r.email}</p>
                      <p className="mt-0.5 text-sm text-ink-600">
                        {[r.year ? `Year ${r.year}` : null, r.branch, `asked ${day(r.requestedAt)}`].filter(Boolean).join(" · ")}
                      </p>
                      {r.reason ? <p className="mt-2 break-words rounded-apple-sm bg-ink-50 p-2 text-sm text-ink-800">“{r.reason}”</p> : null}
                      {r.earlierRequests > 0 ? (
                        <p className="mt-2 text-xs text-ink-600">
                          Asked before: {r.earlierRequests} {r.earlierRequests === 1 ? "time" : "times"}
                          {r.earlierRejected ? `, ${r.earlierRejected} rejected` : ""}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => decide([r.id], "approve")} className={cn(buttonVariants({ variant: "primary", size: "md" }), act)}>
                          Approve
                        </button>
                        <button type="button" disabled={busy} onClick={() => decide([r.id], "reject")} className={cn(buttonVariants({ variant: "outline", size: "md" }), act)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </Surface>
              ))}
            </ul>
          </>
        )}
        <div role="status" className="text-sm text-ink-700">
          {message}
        </div>
        <div role="alert" className="text-sm text-danger">
          {error}
        </div>
      </section>

      {decided.length > 0 ? (
        <section aria-labelledby="recent-h" className="space-y-3">
          <h2 id="recent-h" className="text-base font-semibold text-ink-900">
            Recent decisions
          </h2>
          <ul className="space-y-2">
            {decided.map((r) => (
              <Surface as="li" key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words font-medium text-ink-900">{r.name}</p>
                  <Pill tone={r.status === "approved" ? "live" : "neutral"}>{r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Cancelled"}</Pill>
                </div>
                <p className="mt-0.5 text-sm text-ink-600">
                  {WHO[r.decidedByType ?? ""] ?? "Closed"}
                  {r.decidedAt ? ` · ${day(r.decidedAt)}` : ""} · asked {day(r.requestedAt)}
                </p>
                {r.decisionNote ? <p className="mt-1 break-words text-sm text-ink-700">Note: {r.decisionNote}</p> : null}
              </Surface>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
