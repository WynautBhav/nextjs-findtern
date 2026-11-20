"use client";

import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

import { useProgressRouter } from "@/components/layout/navigation-progress";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACCOUNT_ON_HOLD_CONTACT } from "@/lib/account-hold";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * The blocking notice for a first confirmed violation. The layout mounts it only while the account has an unacknowledged
 * warning; Acknowledge records it server-side (so it never returns, on any device). Nothing dismisses it: no close button,
 * Escape and outside clicks are ignored, focus is trapped. Calm and general: no evidence, no score, no reason code.
 */
export function WarningGate({ initialOpen = true }: { initialOpen?: boolean }) {
  const router = useProgressRouter();
  const [open, setOpen] = useState(initialOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/account/acknowledge-warning", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      setOpen(false);
      router.refresh();
    } catch {
      setError("We could not save this. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-800"><ShieldAlert className="size-5" aria-hidden /></div>
          <DialogTitle className="text-xl leading-snug text-ink-900">A notice about your account</DialogTitle>
          <DialogDescription className="text-base text-ink-600">
            Findtern reviewed activity on your account and found it did not follow our terms of use.
          </DialogDescription>
        </DialogHeader>
        <p className="text-base text-ink-700">
          This is a warning. Your account stays active and nothing has been removed. A second confirmed breach puts your account on hold: you would not be able to sign in until Findtern admin restores access.
        </p>
        <p className="text-sm text-ink-700">If you think this is a mistake, write to <a href={`mailto:${ACCOUNT_ON_HOLD_CONTACT}`} className="font-medium text-brand-700 underline underline-offset-4">{ACCOUNT_ON_HOLD_CONTACT}</a>.</p>
        <p role="alert" className="text-sm text-danger empty:hidden">{error}</p>
        <button type="button" onClick={acknowledge} disabled={saving} className={buttonClass({ variant: "primary", block: true })}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          I understand, acknowledge
        </button>
      </DialogContent>
    </Dialog>
  );
}
