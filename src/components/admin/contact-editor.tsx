"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/client-fetch";
import { isValidPhone, phoneError, phoneHint } from "@/lib/phone";
import { DIAL_CODE_VALUES } from "@/lib/data/dial-codes";

const fieldBase =
  "mt-1.5 h-11 rounded-full border border-ink-300 bg-[color:var(--admin-panel)] px-4 text-base sm:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle";
// Width is decided per use: the phone row mixes a fixed-width select with a flexible input, and two width classes on one element do not reliably resolve.
const inputClass = `${fieldBase} w-full`;

const CODES = DIAL_CODE_VALUES;

type Contact = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
};

/** Admin correction of a user's name, email and phone. Audit-logged server-side. */
export function ContactEditor({
  targetType,
  targetId,
  initial,
}: {
  targetType: "intern" | "employer";
  targetId: string;
  initial: Contact;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Contact>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Contact>) => setDraft((d) => ({ ...d, ...patch }));
  const phoneOk = isValidPhone(draft.countryCode, draft.phoneNumber);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/contact", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId, ...draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not save.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Not saved: the network request failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(initial);
          setError(null);
          setOpen(true);
        }}
        className={cn(buttonClass({ variant: "outline", size: "sm" }), ADMIN_PILL_SECONDARY)}
      >
        <Pencil className="size-4" aria-hidden />
        Edit contact
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit contact details</DialogTitle>
            <DialogDescription>
              Corrections are saved to the account immediately and recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {targetType === "intern" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-foreground">
                  First name
                  <input value={draft.firstName ?? ""} onChange={(e) => set({ firstName: e.target.value })} className={inputClass} />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  Last name
                  <input value={draft.lastName ?? ""} onChange={(e) => set({ lastName: e.target.value })} className={inputClass} />
                </label>
              </div>
            ) : (
              <label className="block text-sm font-medium text-foreground">
                Contact name
                <input value={draft.name ?? ""} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
              </label>
            )}
            <label className="block text-sm font-medium text-foreground">
              Email {targetType === "employer" ? "(login)" : ""}
              <input type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} className={inputClass} />
            </label>
            <div>
              <span className="block text-sm font-medium text-foreground">Phone</span>
              <div className="flex gap-2">
                <select
                  aria-label="Country code"
                  value={draft.countryCode}
                  onChange={(e) => set({ countryCode: e.target.value })}
                  className={`${fieldBase} w-28 shrink-0`}
                >
                  {(CODES.includes(draft.countryCode) ? CODES : [draft.countryCode, ...CODES]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="numeric"
                  aria-label="Phone number"
                  value={draft.phoneNumber}
                  onChange={(e) => set({ phoneNumber: e.target.value.replace(/\D/g, "") })}
                  aria-invalid={!phoneOk || undefined}
                  className={`${fieldBase} min-w-0 flex-1`}
                />
              </div>
              <p className={`mt-1 text-xs ${phoneOk ? "text-text-subtle" : "text-danger"}`}>
                {phoneOk ? phoneHint(draft.countryCode) : phoneError(draft.countryCode, draft.phoneNumber)}
              </p>
            </div>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={save}
              disabled={saving || !phoneOk}
              className={buttonClass({ variant: "primary", size: "sm", className: ADMIN_PILL_PRIMARY })}
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
