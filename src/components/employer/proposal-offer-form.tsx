"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type EditableOffer = {
  roleTitle?: string;
  duration?: string;
  startDate?: string;
  monthlyHours?: number;
  paidLeavesPerMonth?: number;
  message?: string;
};

/**
 * Inline offer editor on the proposal detail page. Same fields the composer
 * writes, minus identity (project / candidate never change). Draft / sent
 * only - the server rejects anything later, and the form does not render
 * there at all.
 */
export function ProposalOfferForm({
  proposalId,
  initial,
}: {
  proposalId: string;
  initial: EditableOffer;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roleTitle, setRoleTitle] = useState(initial.roleTitle ?? "");
  const [duration, setDuration] = useState(initial.duration ?? "3m");
  const [startDate, setStartDate] = useState(initial.startDate ?? "");
  const [monthlyHours, setMonthlyHours] = useState(
    initial.monthlyHours !== undefined ? String(initial.monthlyHours) : "",
  );
  const [leaves, setLeaves] = useState(
    initial.paidLeavesPerMonth !== undefined ? String(initial.paidLeavesPerMonth) : "",
  );
  const [message, setMessage] = useState(initial.message ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const offer: Record<string, unknown> = {};
    if (roleTitle.trim()) offer.roleTitle = roleTitle.trim();
    if (["1m", "2m", "3m", "6m"].includes(duration)) offer.duration = duration;
    if (startDate.trim()) offer.startDate = startDate.trim();
    if (monthlyHours.trim() !== "") offer.monthlyHours = Math.max(0, Math.min(744, Number(monthlyHours) || 0));
    if (leaves.trim() !== "") offer.paidLeavesPerMonth = Math.max(0, Math.min(31, Number(leaves) || 0));
    offer.message = message.trim();
    try {
      const res = await csrfFetch(`/api/proposals/${encodeURIComponent(proposalId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save - try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-ink-200/70 bg-white px-4 text-sm font-medium text-ink-700 hover:border-brand-300 hover:text-brand-800"
      >
        <Pencil className="size-4" aria-hidden />
        Edit offer
      </button>
    );
  }

  const input =
    "apple-spring h-11 w-full rounded-[10px] border border-ink-200/90 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="space-y-3 rounded-[10px] border border-ink-200/70 bg-ink-50/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-700">Role title</span>
          <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-700">Duration</span>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className={input}>
            {["1m", "2m", "3m", "6m"].map((d) => (
              <option key={d} value={d}>
                {d === "1m" ? "1 month" : `${d.replace("m", "")} months`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-700">Start date</span>
          <input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="e.g. 1 Nov 2026" className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-700">Hours per month</span>
          <input value={monthlyHours} inputMode="numeric" onChange={(e) => setMonthlyHours(e.target.value.replace(/[^\d]/g, ""))} className={cn(input, "tabular-nums")} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-ink-700">Paid leaves per month</span>
          <input value={leaves} inputMode="numeric" onChange={(e) => setLeaves(e.target.value.replace(/[^\d]/g, ""))} className={cn(input, "w-32 tabular-nums")} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-ink-700">Cover note</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="apple-spring min-h-24 w-full rounded-[10px] border border-ink-200/90 bg-white px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
      </label>
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="apple-spring apple-pressable inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save changes
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center rounded-[10px] border border-ink-200/70 bg-white px-4 text-xs font-medium text-ink-600 hover:bg-ink-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
