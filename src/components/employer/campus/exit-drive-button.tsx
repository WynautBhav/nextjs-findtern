"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/** "Exit campus drive": confirm what changes, then leave. The server lifts the lock and tells the college. */
export function ExitDriveButton({ driveId, collegeName }: { driveId: string; collegeName: string }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exit() {
    const ok = await ask({
      title: "Exit this campus drive?",
      body: `You'll see all of Findtern's candidates again, not only ${collegeName}'s. New hires from now on are billed at standard rates: no 15% drive discount, and an 8.33% full-time fee. Offers and hires you made in the drive keep their drive pricing. ${collegeName}'s placement office is told you left.`,
      confirmLabel: "Exit the drive",
      cancelLabel: "Stay in the drive",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await csrfFetch("/api/employer/virtual-drive/exit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ driveId }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError("Couldn't leave the drive. Try again.");
      return;
    }
    router.push("/employer/candidates");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button type="button" onClick={exit} disabled={busy} className={buttonClass({ variant: "outlineLight", size: "sm" })}>
        {busy ? "Leaving…" : "Exit campus drive"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-white">
          {error}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}
