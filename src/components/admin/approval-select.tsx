"use client";

import { useState } from "react";

import { csrfFetch } from "@/lib/client-fetch";

const OPTIONS = ["Pending", "Approved", "Rejected"] as const;

/** Admin review label for a candidate (legacy extraData.approvalStatus). */
export function ApprovalSelect({ internId, value }: { internId: string; value: string }) {
  const [v, setV] = useState(OPTIONS.includes(value as (typeof OPTIONS)[number]) ? value : "Pending");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function change(next: string) {
    const prev = v;
    setV(next);
    setState("saving");
    const res = await csrfFetch(`/api/admin/interns/${internId}/approval`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus: next }),
    });
    if (res.ok) setState("idle");
    else {
      setV(prev);
      setState("error");
    }
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-700">
      Review
      <select
        value={v}
        disabled={state === "saving"}
        onChange={(e) => change(e.target.value)}
        className="h-10 rounded-[10px] border border-ink-200 bg-white px-2.5 text-xs font-semibold text-ink-800"
      >
        {OPTIONS.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {state === "error" ? <span className="text-danger">Not saved</span> : null}
    </label>
  );
}
