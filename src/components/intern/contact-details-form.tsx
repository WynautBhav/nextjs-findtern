"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { DIAL_CODES, DIAL_CODE_VALUES } from "@/lib/data/dial-codes";
import { phoneError, phoneHint } from "@/lib/phone";

import { Field, FieldNote, Grid, Label, Select, controlClass } from "./onboarding/fields";

/** Name and phone on the account (email stays fixed: it's the sign-in). */
export function ContactDetailsForm({
  userId,
  initial,
}: {
  userId: string;
  initial: { firstName: string; lastName: string; countryCode: string; phoneNumber: string };
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const saveBtn = useRef<HTMLButtonElement>(null);
  const set = (k: keyof typeof v) => (value: string) => setV((s) => ({ ...s, [k]: value }));

  const live: Record<string, string> = {};
  if (v.firstName.trim().length < 2) live.firstName = "Enter your first name.";
  if (!v.lastName.trim()) live.lastName = "Enter your last name.";
  const phone = phoneError(v.countryCode, v.phoneNumber);
  if (phone) live.phoneNumber = `${phone}.`;
  const errors = attempted ? live : {};

  const codes = DIAL_CODE_VALUES.includes(v.countryCode) ? DIAL_CODES : [{ code: v.countryCode, country: "" }, ...DIAL_CODES];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setMsg(null);
    const first = Object.keys(live)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: data.error ?? "Couldn't save. Try again." });
      if (res.ok) router.refresh();
    } catch {
      setMsg({ ok: false, text: "Couldn't save. Check your connection and try again." });
    } finally {
      setBusy(false);
      // The button was disabled while saving, which dropped focus to <body>; put it back.
      requestAnimationFrame(() => saveBtn.current?.focus());
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <Grid>
        <Field id="firstName" label="First name" value={v.firstName} onChange={set("firstName")} autoComplete="given-name" error={errors.firstName} />
        <Field id="lastName" label="Last name" value={v.lastName} onChange={set("lastName")} autoComplete="family-name" error={errors.lastName} />
      </Grid>
      <div className="min-w-0">
        <Label htmlFor="phoneNumber">Mobile number</Label>
        <div className="mt-2 grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-2.5">
          <Select
            id="countryCode"
            ariaLabel="Country code"
            value={v.countryCode}
            onChange={set("countryCode")}
            options={codes.map((c) => ({ value: c.code, label: c.country ? `${c.code} ${c.country}` : c.code }))}
          />
          <input
            id="phoneNumber"
            name="phoneNumber"
            inputMode="tel"
            autoComplete="tel-national"
            value={v.phoneNumber}
            onChange={(e) => set("phoneNumber")(e.target.value.replace(/\D/g, "").slice(0, 15))}
            aria-invalid={errors.phoneNumber ? true : undefined}
            aria-describedby={errors.phoneNumber ? "phoneNumber-error" : "phoneNumber-hint"}
            className={controlClass(errors.phoneNumber, "nums")}
          />
        </div>
        <FieldNote id="phoneNumber" error={errors.phoneNumber} hint={phoneHint(v.countryCode)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button ref={saveBtn} type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "md" })}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? "Saving…" : "Save details"}
        </button>
        {/* Mounted empty, then filled, so the result is announced. */}
        <span role="status" className={msg?.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {msg?.text}
        </span>
      </div>
    </form>
  );
}
