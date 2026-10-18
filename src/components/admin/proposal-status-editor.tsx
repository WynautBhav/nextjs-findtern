"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

/**
 * Admin override for one proposal row. Staff can nudge a stuck trail -
 * withdraw a stale sent offer or expire it - through the same guarded status
 * route the parties use, so the state machine and ownership checks still
 * apply. Hired / accepted rows are history and render nothing.
 */
const EDITABLE = ["sent", "interview_scheduled", "draft"] as const;
const OPTIONS = [
  { value: "withdrawn", label: "Withdraw" },
  { value: "rejected", label: "Reject" },
  { value: "expired", label: "Expire" },
] as const;

export function ProposalStatusEditor({
  proposalId,
  status,
}: {
  proposalId: string;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!(EDITABLE as readonly string[]).includes(status)) {
    return <span className="text-xs text-text-subtle">-</span>;
  }

  async function save() {
    if (!value) return;
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
        setError(json?.error ?? "Could not save - try again.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-44 items-center gap-1.5">
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
        className="apple-spring h-11 min-w-0 flex-1 rounded-[10px] border border-ink-200/90 bg-white px-2 text-xs font-medium text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      >
        <option value="">Set status…</option>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={saving || !value}
        className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : "Save"}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
