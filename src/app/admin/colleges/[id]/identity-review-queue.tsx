"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import type { ReviewDto } from "@/lib/drives/admin-db";

/** Phone + name suggestions. Nothing links until an admin approves it here. */
export function IdentityReviewQueue({ reviews, canWrite }: { reviews: ReviewDto[]; canWrite: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ id: string; decision: "link" | "reject" } | null>(null);

  async function decide(id: string, decision: "link" | "reject") {
    setAsking(null);
    setBusyId(id);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/identity-reviews/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not work. Try again.");
      else router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (reviews.length === 0) return <p className="text-sm text-ink-500">No suggestions waiting for review.</p>;
  return (
    <div className="space-y-3">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-3">
        {reviews.map((r) => (
          <Surface as="li" key={r.id} className="space-y-3 p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <h4 className="text-xs font-medium uppercase text-ink-500">Roster row</h4>
                <p className="font-medium">{r.entryName}</p>
                <p className="break-all text-ink-600">{r.entryEmail}</p>
                <p className="text-ink-600">{r.entryPhone ?? "No phone"}</p>
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-medium uppercase text-ink-500">Possible Findtern student</h4>
                <p className="font-medium">{r.candidateName}</p>
                <p className="break-all text-ink-600">{r.candidateEmail}</p>
              </div>
            </div>
            <p className="text-xs text-ink-500">Why suggested: same phone and name, different email. Nothing is linked until you choose.</p>
            {canWrite ? (
              asking?.id === r.id ? (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm decision">
                  <span className="text-sm">{asking.decision === "link" ? `Link ${r.entryEmail} to ${r.candidateName}?` : "Reject this suggestion?"}</span>
                  <button type="button" disabled={busyId === r.id} className={buttonClass({ variant: "primary", size: "sm" })} onClick={() => decide(r.id, asking.decision)}>{asking.decision === "link" ? "Yes, link" : "Yes, reject"}</button>
                  <button type="button" className={buttonClass({ variant: "light", size: "sm" })} onClick={() => setAsking(null)}>Cancel</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" disabled={busyId === r.id} className={buttonClass({ variant: "primary", size: "sm" })} onClick={() => setAsking({ id: r.id, decision: "link" })}>Link: same person</button>
                  <button type="button" disabled={busyId === r.id} className={buttonClass({ variant: "light", size: "sm" })} onClick={() => setAsking({ id: r.id, decision: "reject" })}>Reject: not them</button>
                </div>
              )
            ) : null}
          </Surface>
        ))}
      </ul>
    </div>
  );
}
