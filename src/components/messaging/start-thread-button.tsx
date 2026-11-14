"use client";

import { useState } from "react";
import { useProgressRouter } from "@/components/layout/navigation-progress";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/** Opens (or creates) the conversation with `counterpartId` and goes to it. `role` picks the console the thread lives in. */
export function StartThreadButton({
  counterpartId,
  proposalId,
  role,
  className,
  children = "Message",
}: {
  counterpartId: string;
  proposalId?: string;
  role: "employer" | "intern";
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useProgressRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      const r = await csrfFetch("/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ counterpartId, proposalId }),
      });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { thread: { id: string } };
      router.push(`/${role}/messages/${encodeURIComponent(j.thread.id)}`);
    } catch {
      setError("Could not open the conversation. Try again.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className={cn("inline-flex min-h-11 items-center justify-center rounded-apple-sm bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-60", className)}
      >
        {busy ? "Opening…" : children}
      </button>
      <span role="alert" className="text-xs text-danger empty:hidden">
        {error}
      </span>
    </span>
  );
}
