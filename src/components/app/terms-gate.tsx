"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { termsHrefFor, type TermsRole } from "@/lib/terms";

const SIGN_OUT_TO: Record<TermsRole, string> = {
  intern: "/login?as=intern",
  employer: "/login?as=employer",
  college: "/login?as=college",
};

/**
 * One-time "we redesigned the site and updated the terms" prompt. The layout
 * only mounts it when the account has not accepted the current version, and
 * the server records acceptance, so it never returns on any device.
 *
 * Acceptance is required, so nothing dismisses it: no close button, Escape and
 * outside clicks are ignored. Focus is trapped inside by the dialog primitive.
 */
export function TermsGate({ role }: { role: TermsRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkRef = useRef<HTMLButtonElement>(null);
  const checkId = useId();
  const errorId = useId();

  // Same call and cleanup as the console's Sign out button (console-shell.tsx).
  async function signOut() {
    const res = await csrfFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setError("Sign out didn't go through. Check your connection and try again.");
      return;
    }
    try {
      for (const k of Object.keys(window.localStorage)) if (k.startsWith("findtern:") && k.includes("-onboarding")) window.localStorage.removeItem(k);
    } catch {
      // Storage blocked: nothing was saved there either.
    }
    router.replace(SIGN_OUT_TO[role]);
    router.refresh();
  }

  async function accept() {
    if (!agreed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/terms/accept", { method: "POST" });
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
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          checkRef.current?.focus();
        }}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-xl leading-snug text-ink-900">Findtern has a new look and updated terms</DialogTitle>
          <DialogDescription className="text-base text-ink-600">
            We redesigned the site and updated our terms of service. Please read them and accept to keep using your account.
          </DialogDescription>
        </DialogHeader>

        <a
          href={termsHrefFor(role)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 text-base font-medium text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Read the updated terms
          <ExternalLink className="size-4" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>

        <div className="flex items-start gap-3">
          <Checkbox
            ref={checkRef}
            id={checkId}
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            aria-describedby={error ? errorId : undefined}
            className="mt-0.5"
          />
          <label htmlFor={checkId} className="text-base text-ink-900">
            I have read and accept the updated terms
          </label>
        </div>

        {error ? (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={accept}
          disabled={!agreed || saving}
          className={buttonClass({ variant: "primary", block: true })}
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Continue
        </button>
        <button type="button" onClick={signOut} disabled={saving} className={buttonClass({ variant: "outline", block: true })}>
          Sign out
        </button>
      </DialogContent>
    </Dialog>
  );
}
