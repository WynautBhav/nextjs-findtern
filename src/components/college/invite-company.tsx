"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { inviteSentLine } from "@/lib/college/drive-invite-line";
import { buttonClass } from "@/components/ui/button";

/** The drive form's field (drive-builder.tsx). */
const field =
  "h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/**
 * Invite one more company to a running drive: it alone is emailed its own invite. The link stays as it is and nobody
 * inside is let out (Replace link does that). `onNote` reports the result in the Link panel's status line.
 */
export function InviteCompany({ driveId, onNote }: { driveId: string; onNote: (text: string | null, error?: boolean) => void }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setError(null);
    requestAnimationFrame(() => opener.current?.focus());
  }

  async function submit(form: HTMLFormElement) {
    if (busy) return;
    const f = new FormData(form);
    const body = { company: String(f.get("company") ?? ""), email: String(f.get("email") ?? ""), name: String(f.get("name") ?? ""), phone: String(f.get("phone") ?? "") };
    setBusy(true);
    setError(null);
    const res = await csrfFetch(`/api/college/drives/${driveId}/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { error?: string; invites?: { sent: string[]; failed: string[]; limited: string[] } } | null;
    setBusy(false);
    if (!res?.ok) return setError(out?.error ?? "Couldn't invite this company. Try again.");
    const inv = out?.invites;
    // Nothing sent, failed or held back: this address already had its one invite for the drive today.
    onNote(inv && (inv.sent.length || inv.failed.length || inv.limited.length) ? inviteSentLine(inv.sent, inv.failed, inv.limited) : `${body.company.trim()} is added. They were already emailed an invite today, so no second email went out.`);
    close();
    router.refresh();
  }

  if (!open) {
    return (
      <button ref={opener} type="button" onClick={() => (onNote(null), setOpen(true))} className={buttonClass({ variant: "primary", size: "sm" })}>
        Invite a company
      </button>
    );
  }
  return (
    <form
      aria-labelledby={`${id}-t`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
      className="w-full rounded-apple-md border border-ink-200 bg-ink-50 p-4"
    >
      <p id={`${id}-t`} className="text-sm font-medium text-ink-900">Invite a company</p>
      <p className="mt-1 text-sm text-ink-700">Only this company gets an email. Everyone already in the drive stays in. Ask them to sign in with this exact email.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink-800">
          Company name
          <input name="company" required maxLength={120} autoFocus className={`${field} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          Email
          <input name="email" type="email" required maxLength={200} autoComplete="off" className={`${field} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          Contact name <span className="font-normal text-text-subtle">(optional)</span>
          <input name="name" maxLength={120} className={`${field} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          Phone <span className="font-normal text-text-subtle">(optional)</span>
          <input name="phone" type="tel" maxLength={40} className={`${field} mt-1.5`} />
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* aria-disabled, not disabled: a disabled button drops the keyboard focus to the page while it sends. */}
        <button type="submit" aria-disabled={busy} className={buttonClass({ variant: "primary", size: "sm" })}>
          {busy ? "Sending invite…" : "Send invite"}
        </button>
        <button type="button" onClick={close} className={buttonClass({ variant: "outline", size: "sm" })}>
          Cancel
        </button>
      </div>
    </form>
  );
}
