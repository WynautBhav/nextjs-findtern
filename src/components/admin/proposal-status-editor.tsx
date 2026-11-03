"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * Admin override for one proposal row, through the same guarded status route
 * the parties use. Staff can close a stale open offer, reject it on the
 * candidate's behalf (the candidate gets a neutral "closed by Findtern"
 * email), or cancel an accepted offer the employer has not paid for - the
 * employer cannot back out themselves once the candidate has accepted.
 * Staff never accept for a candidate. Hired rows are history.
 */
const OPEN = ["sent", "interview_scheduled", "draft"];
const OPEN_OPTIONS = [
  { value: "expired", label: "Close as expired" },
  { value: "rejected", label: "Reject for candidate" },
];
const ACCEPTED_OPTIONS = [{ value: "withdrawn", label: "Cancel (unpaid)" }];

/** The two moves that end a live offer for a party who did not ask for it. */
const CONFIRM: Record<string, { title: string; body: string; confirmLabel: string }> = {
  rejected: {
    title: "Reject this offer for the candidate?",
    body: "The candidate is emailed that Findtern closed the offer. They cannot accept it afterwards.",
    confirmLabel: "Yes, reject it",
  },
  withdrawn: {
    title: "Cancel this unpaid offer?",
    body: "The candidate has already accepted. Cancelling withdraws the offer and the employer is not charged.",
    confirmLabel: "Yes, cancel it",
  },
};

export function ProposalStatusEditor({
  proposalId,
  status,
}: {
  proposalId: string;
  status: string;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const options = OPEN.includes(status) ? OPEN_OPTIONS : status === "accepted" ? ACCEPTED_OPTIONS : [];
  if (options.length === 0) {
    return <span className="text-sm text-text-subtle">-</span>;
  }

  async function save() {
    if (!value) return;
    const confirm = CONFIRM[value];
    if (confirm && !(await ask(confirm))) return;
    setSaving(true);
    setError("");
    try {
      const res = await csrfFetch(`/api/proposals/${encodeURIComponent(proposalId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? `Not saved (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Not saved: the network request failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-44 flex-wrap items-center gap-1.5">
      {dialog}
      <label className="sr-only" htmlFor={`ps-${proposalId}`}>
        Set proposal status
      </label>
      <select
        id={`ps-${proposalId}`}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        className="h-9 min-w-0 flex-1 rounded-apple-sm border border-ink-200 bg-surface px-2 text-sm font-medium text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 max-lg:h-11"
      >
        <option value="">Set status…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={saving || !value}
        className={buttonClass({ variant: "primary", size: "sm", className: "max-lg:h-11" })}
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : "Save"}
      </button>
      {error ? (
        <span role="alert" className="basis-full text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
