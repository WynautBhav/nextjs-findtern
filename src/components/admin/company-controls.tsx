"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";

/** Account status, International FTE decision and delete, for one employer. */
export function CompanyControls({ id, isActive, fteStatus }: { id: string; isActive: boolean; fteStatus: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await csrfFetch(`/api/admin/companies/${id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "That didn't work.");
    if (method === "DELETE") router.push("/admin/companies");
    else router.refresh();
  }

  const btn = "inline-flex min-h-10 items-center rounded-[10px] border px-3 text-xs font-semibold disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => call("PATCH", { isActive: !isActive })}
        className={`${btn} ${isActive ? "border-danger/30 text-danger hover:bg-danger-soft" : "border-brand-200 text-brand-700 hover:bg-brand-50"}`}
      >
        {isActive ? "Deactivate" : "Activate"}
      </button>
      {fteStatus === "applied" ? (
        <>
          <button type="button" disabled={busy} onClick={() => call("PATCH", { internationalFteStatus: "approved" })} className={`${btn} border-brand-200 text-brand-700 hover:bg-brand-50`}>
            Approve International FTE
          </button>
          <button type="button" disabled={busy} onClick={() => call("PATCH", { internationalFteStatus: "rejected" })} className={`${btn} border-ink-200 text-ink-700 hover:bg-ink-50`}>
            Decline FTE
          </button>
        </>
      ) : (
        <span className="text-xs text-text-subtle">International FTE: {fteStatus}</span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => window.confirm("Delete this employer permanently?") && call("DELETE")}
        className={`${btn} border-transparent text-danger hover:bg-danger-soft`}
      >
        Delete
      </button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
