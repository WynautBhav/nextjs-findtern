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
import { csrfFetch } from "@/lib/client-fetch";
import { isValidPhone, phoneError, phoneHint } from "@/lib/phone";

const inputClass =
  "apple-spring mt-1.5 min-h-10 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const CODES = ["+91", "+1", "+44", "+61", "+49", "+65", "+971", "+974"];

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
    const res = await csrfFetch("/api/admin/contact", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType, targetId, ...draft }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save.");
      return;
    }
    setOpen(false);
    router.refresh();
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
        className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
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
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-ink-700">
                  First name
                  <input value={draft.firstName ?? ""} onChange={(e) => set({ firstName: e.target.value })} className={inputClass} />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Last name
                  <input value={draft.lastName ?? ""} onChange={(e) => set({ lastName: e.target.value })} className={inputClass} />
                </label>
              </div>
            ) : (
              <label className="block text-xs font-medium text-ink-700">
                Contact name
                <input value={draft.name ?? ""} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
              </label>
            )}
            <label className="block text-xs font-medium text-ink-700">
              Email {targetType === "employer" ? "(login)" : ""}
              <input type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} className={inputClass} />
            </label>
            <div>
              <span className="block text-xs font-medium text-ink-700">Phone</span>
              <div className="flex gap-2">
                <select
                  aria-label="Country code"
                  value={draft.countryCode}
                  onChange={(e) => set({ countryCode: e.target.value })}
                  className={`${inputClass} w-24 shrink-0`}
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
                  className={inputClass}
                />
              </div>
              <p className={`mt-1 text-2xs ${phoneOk ? "text-text-subtle" : "text-danger"}`}>
                {phoneOk ? phoneHint(draft.countryCode) : phoneError(draft.countryCode, draft.phoneNumber)}
              </p>
            </div>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={save}
              disabled={saving || !phoneOk}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
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
