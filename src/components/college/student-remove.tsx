"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/** Remove one student from the college (a deny). Their Findtern account is untouched; the officer can add them back from Approvals. */
export function StudentRemove({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    const ok = await ask({
      title: `Remove ${name} from your college?`,
      body: "They leave your students and your campus drives straight away, and cannot rejoin with a code. Their own Findtern account is not affected. You can add them back from Approvals.",
      confirmLabel: "Yes, remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await csrfFetch("/api/college/students/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userIds: [userId], action: "deny" }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not remove. Try again.");
        return;
      }
      router.push("/college/students");
      router.refresh();
    } catch {
      setError("Could not remove. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1 sm:items-end">
      <button type="button" onClick={remove} disabled={busy} className={buttonClass({ variant: "outline", size: "sm", className: "border-danger/30 text-danger hover:border-danger/50 hover:bg-danger/5" })}>
        {busy ? "Removing…" : "Remove from college"}
      </button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
      {dialog}
    </span>
  );
}
