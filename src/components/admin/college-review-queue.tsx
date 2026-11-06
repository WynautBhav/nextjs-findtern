"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import type { ReviewItem } from "@/lib/college/roster-import";

/**
 * Admin: roster rows whose only matches are a shared phone or name. The admin links the right account or
 * rejects the suggestion; nothing links on its own (OA5). Every decision is audited server-side.
 */
export function CollegeReviewQueue({ items, showCollege, canEdit }: { items: ReviewItem[]; showCollege: boolean; canEdit: boolean }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(item: ReviewItem, body: { action: "link"; userId: string } | { action: "reject" }, confirm: { title: string; body: string; confirmLabel: string; destructive?: boolean }) {
    if (!(await ask(confirm))) return;
    setBusy(item.rosterId);
    setError(null);
    const res = await csrfFetch(`/api/admin/colleges/${item.collegeId}/roster/${item.rosterId}/match`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (!res?.ok) return setError(json?.error ?? "Couldn't save the decision. Try again.");
    router.refresh();
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="border-b border-ink-100 px-[var(--admin-pad-panel)] py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-ink-100">
        {items.map((it) => (
          <li key={it.rosterId} className="grid gap-3 px-[var(--admin-pad-panel)] py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{it.name || it.email}</p>
              <p className="break-all text-sm text-text-subtle">{it.email}</p>
              <p className="mt-0.5 text-sm text-text-subtle">
                {[it.phone ? `Mobile ${it.phone}` : null, it.rollNo ? `Roll ${it.rollNo}` : null].filter(Boolean).join(" · ") || "No phone or roll number"}
              </p>
              {showCollege ? (
                <Link href={`/admin/colleges/${it.collegeId}`} className="mt-1 inline-block text-sm font-medium underline underline-offset-4 touch:inline-flex touch:min-h-11 touch:items-center">
                  {it.collegeName}
                </Link>
              ) : null}
            </div>
            <div className="min-w-0 space-y-2">
              {it.candidates.length === 0 ? <p className="text-sm text-text-subtle">The suggested accounts no longer exist. Reject this match.</p> : null}
              {it.candidates.map((c) => (
                <div key={c.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-apple-sm border border-ink-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="break-all text-xs text-text-subtle">
                      {c.email} {c.emailVerified ? "(verified)" : "(not verified)"} · {c.phone}
                    </p>
                    <p className="text-xs text-foreground">{c.reason === "phone" ? "Same mobile number as the roster row" : "Same name as the roster row"}</p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={busy === it.rosterId}
                      onClick={() =>
                        decide(it, { action: "link", userId: c.userId }, { title: `Link ${it.name || it.email} to ${c.name}?`, body: `The roster row will point at ${c.email}. It records the match only; it does not give them the fee waiver.`, confirmLabel: "Link" })
                      }
                      className={buttonClass({ size: "sm", className: "rounded-full px-4 shadow-none" })}
                    >
                      Link
                    </button>
                  ) : null}
                </div>
              ))}
              {canEdit ? (
                <button
                  type="button"
                  disabled={busy === it.rosterId}
                  onClick={() => decide(it, { action: "reject" }, { title: "Reject this match?", body: "The roster row stays, unlinked. It will not come back to the review queue.", confirmLabel: "Reject", destructive: true })}
                  className={buttonClass({ size: "sm", className: ADMIN_PILL_SECONDARY })}
                >
                  None of these, reject
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {dialog}
    </div>
  );
}
