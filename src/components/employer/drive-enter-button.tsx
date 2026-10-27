"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/** Trades the share-link token for the employer's pass into the drive. */
export function DriveEnterButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/drives/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string; error?: string };
      if (!res.ok || !data.redirect) {
        setError(data.error ?? "Couldn't open the drive. Try again.");
        setBusy(false);
        return;
      }
      // replace, so Back doesn't return to a URL carrying the token.
      router.replace(data.redirect);
    } catch {
      setError("You're offline. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={enter} disabled={busy} className={buttonVariants({ size: "lg", block: true })}>
        {busy ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : null}
        {busy ? "Opening drive…" : "Enter drive"}
        {busy ? null : <ArrowRight className="size-4" aria-hidden />}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
