"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { phoneHint } from "@/lib/phone";

const input =
  "mt-1.5 h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: data.error ?? "Couldn't save." });
      if (res.ok) router.refresh();
    } catch {
      setMsg({ ok: false, text: "Couldn't save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink-800">
          First name
          <input required minLength={2} value={v.firstName} onChange={set("firstName")} className={input} autoComplete="given-name" />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          Last name
          <input required value={v.lastName} onChange={set("lastName")} className={input} autoComplete="family-name" />
        </label>
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-3 sm:gap-4">
        <label className="block text-sm font-medium text-ink-800">
          Code
          <input required value={v.countryCode} onChange={set("countryCode")} className={input} />
        </label>
        <label className="block text-sm font-medium text-ink-800">
          Phone
          <input required inputMode="tel" value={v.phoneNumber} onChange={set("phoneNumber")} className={input} autoComplete="tel-national" />
          <span className="mt-1 block text-xs font-normal text-text-subtle">{phoneHint(v.countryCode)}</span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-[10px] bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save details"}
        </button>
        {msg ? (
          <span role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
