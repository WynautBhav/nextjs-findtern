"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { LEAVE_NOTE_MAX } from "@/lib/college/leave-request";
import { formatDate } from "@/lib/format";

export type PendingLeave = { id: string; name: string; email: string; reason: string | null; requestedAt: string };

const field = "h-9 w-full rounded-md border border-ink-200 bg-surface px-2 text-sm touch:min-h-11";

/**
 * Admin fallback for the leave rule: the TPO normally decides, but if the college has no active officer Findtern
 * can approve or reject a pending request, or end a student's membership by e-mail. Same server logic as the TPO.
 */
export function CollegeLeavePanel({ collegeId, canEdit, members, pending }: { collegeId: string; canEdit: boolean; members: number; pending: PendingLeave[] }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await csrfFetch(`/api/admin/colleges/${collegeId}/leave-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; already?: boolean };
      if (!res.ok) {
        setError(data.error ?? "Could not save. Try again.");
        return;
      }
      setDone(data.already ? "Already decided." : okText);
      setEmail("");
      router.refresh();
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const noteBox = (
    <div className="px-1">
      <label htmlFor="leave-admin-note" className="text-sm font-medium">
        Note <span className="font-normal text-text-subtle">(optional, the student can see it)</span>
      </label>
      <textarea id="leave-admin-note" ref={noteRef} rows={2} maxLength={LEAVE_NOTE_MAX} className="mt-1 w-full resize-none rounded-md border border-ink-200 bg-surface px-2 py-1 text-sm" />
    </div>
  );

  async function decide(r: PendingLeave, action: "approve" | "reject") {
    const ok = await ask({
      title: `${action === "approve" ? "Approve" : "Reject"} ${r.name}'s request?`,
      body: action === "approve" ? "They leave this college straight away. Seats and payments are not changed." : "They stay in the college and can ask again.",
      confirmLabel: action === "approve" ? "Approve leave" : "Reject",
      destructive: action === "approve",
      extra: noteBox,
    });
    if (!ok) return;
    await send({ requestId: r.id, action, note: noteRef.current?.value.trim() || undefined }, action === "approve" ? "Approved." : "Rejected.");
  }

  async function end() {
    const target = email.trim();
    if (!target) return;
    const ok = await ask({
      title: `End ${target}'s membership?`,
      body: "They leave this college straight away, without a request from them. Seats and payments are not changed. This is recorded in the audit log.",
      confirmLabel: "End membership",
      destructive: true,
      extra: noteBox,
    });
    if (!ok) return;
    await send({ email: target, action: "end", note: noteRef.current?.value.trim() || undefined }, "Membership ended.");
  }

  return (
    <div className="space-y-3 border-t border-ink-100 pt-4">
      <p className="text-sm">
        <span className="text-xs font-medium text-text-subtle">Students in this college</span>
        <span className="nums ml-2 font-semibold">{members}</span>
      </p>

      <div>
        <p className="text-xs font-medium text-text-subtle">Leave requests waiting ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="mt-1 text-sm text-text-subtle">None. The placement officer decides these; you can step in here.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="rounded-md border border-ink-100 p-2 text-sm">
                <p className="break-words font-medium">{r.name}</p>
                <p className="break-all text-xs text-text-subtle">
                  {r.email} · <span className="whitespace-nowrap">asked {formatDate(r.requestedAt)}</span>
                </p>
                {r.reason ? <p className="mt-1 whitespace-pre-line break-words text-xs">“{r.reason}”</p> : null}
                {canEdit ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => decide(r, "approve")} className={buttonClass({ variant: "dark", size: "sm" })}>
                      Approve
                    </button>
                    <button type="button" disabled={busy} onClick={() => decide(r, "reject")} className={buttonClass({ variant: "outline", size: "sm" })}>
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit ? (
        <div>
          <label htmlFor="leave-admin-email" className="text-xs font-medium text-text-subtle">
            End a student&apos;s membership (by email)
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input id="leave-admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@college.edu" className={`${field} min-w-0 flex-1`} />
            <button type="button" disabled={busy || !email.trim()} onClick={end} className={buttonClass({ variant: "outline", size: "sm" })}>
              End membership
            </button>
          </div>
        </div>
      ) : null}
      <div role="status" className="text-sm text-text-subtle">{done}</div>
      <div role="alert" className="text-sm text-danger">{error}</div>
      {dialog}
    </div>
  );
}
