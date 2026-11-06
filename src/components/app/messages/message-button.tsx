"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * Opens (or reuses) the one thread for this employer–intern pair from a
 * proposal (OA1) and goes to it. The role comes from the console the button
 * sits in (/employer/… or /intern/…). A refusal is shown as the server's sentence.
 */
export function MessageButton({ proposalId, label = "Message" }: { proposalId: string; label?: string }) {
  const router = useRouter();
  const role = usePathname()?.startsWith("/employer") ? "employer" : "intern";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/messages/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const body = (await res.json().catch(() => null)) as { threadId?: string; error?: string } | null;
      if (!res.ok || !body?.threadId) {
        setError(body?.error ?? "Could not open the conversation. Try again.");
        setBusy(false);
        return;
      }
      router.push(`/${role}/messages/${encodeURIComponent(body.threadId)}`);
    } catch {
      setError("Could not reach Findtern. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={open} disabled={busy} aria-busy={busy} className={buttonClass({ variant: "outline", size: "md" })}>
        {busy ? <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" /> : <MessageSquare aria-hidden className="size-4" />}
        {label}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
