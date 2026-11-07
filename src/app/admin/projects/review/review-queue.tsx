"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Panel } from "@/components/admin/panel";
import { buttonClass } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/app/use-confirm";
import { csrfFetch } from "@/lib/client-fetch";
import { scopeLabel } from "@/lib/db/schema";

export type QueueItem = {
  id: string;
  projectName: string;
  company: string;
  scopeOfWork: string | null;
  skills: string[];
  locationType: string | null;
  fullTimeOffer: boolean;
  submittedAt: string | null;
};

export function ReviewQueue({ initial }: { initial: QueueItem[] }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [items, setItems] = useState(initial);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(item: QueueItem, decision: "approve" | "reject") {
    if (decision === "approve" && !(await ask({ title: "Approve this posting?", body: `"${item.projectName}" becomes visible to candidates.`, confirmLabel: "Approve" }))) return;
    setBusy(item.id);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/projects/${item.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: decision === "reject" ? reason : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Could not save the decision.");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setRejecting(null);
      setReason("");
      router.refresh();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <Panel>
        <p className="p-6 text-sm text-ink-600">Nothing is waiting for review.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {dialog}
      {error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.id}>
            <Panel>
              <div className="space-y-3 p-4">
                <div>
                  <h2 className="break-words text-base font-semibold">{i.projectName}</h2>
                  <p className="text-sm text-ink-600">
                    {i.company} · {scopeLabel(i.scopeOfWork)} · {i.locationType ?? "mode not set"}
                    {i.fullTimeOffer ? " · full-time offer" : ""}
                  </p>
                </div>
                <p className="text-sm text-ink-700">Skills ({i.skills.length}): {i.skills.join(", ") || "none"}</p>
                {rejecting === i.id ? (
                  <div className="space-y-2">
                    <label htmlFor={`r-${i.id}`} className="text-sm font-medium">Reason for the employer (required)</label>
                    <Textarea id={`r-${i.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" disabled={busy === i.id || !reason.trim()} onClick={() => void decide(i, "reject")} className={buttonClass({ size: "sm" })}>
                        Send rejection
                      </button>
                      <button type="button" onClick={() => { setRejecting(null); setReason(""); }} className={buttonClass({ variant: "outline", size: "sm" })}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" disabled={busy === i.id} onClick={() => void decide(i, "approve")} className={buttonClass({ size: "sm" })}>
                      Approve
                    </button>
                    <button type="button" disabled={busy === i.id} onClick={() => { setRejecting(i.id); setReason(""); }} className={buttonClass({ variant: "outline", size: "sm" })}>
                      Reject…
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
