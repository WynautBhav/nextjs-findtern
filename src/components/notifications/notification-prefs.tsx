"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { csrfFetch } from "@/lib/client-fetch";

type Key = "emailMessages" | "pushMessages";
type Prefs = Record<Key, boolean>;

const COPY: Record<"intern" | "employer", { key: Key; title: string; help: string; on: string; off: string }[]> = {
  intern: [
    {
      key: "emailMessages",
      title: "Email me about messages and offers I haven't seen",
      help: "If a message or an updated proposal sits unread for 15 minutes, we send one email with a link. Never while you're online.",
      on: "You'll get an email if a message or proposal update goes unread.",
      off: "No reminder emails for unread messages or proposal updates. They still show in the app, and new proposals and offers are still emailed.",
    },
    {
      key: "pushMessages",
      title: "Tips and reminders",
      help: "Profile nudges and monthly profile-view summaries, in the app and by email.",
      on: "Tips and reminders are on.",
      off: "Tips and reminders are off.",
    },
  ],
  employer: [
    {
      key: "emailMessages",
      title: "Email me about messages I haven't seen",
      help: "If a candidate's message sits unread for 15 minutes, we send one email with a link. Never while you're online.",
      on: "You'll get an email if a message goes unread.",
      off: "No emails for unread messages. They still show in the app.",
    },
    {
      key: "pushMessages",
      title: "Tips and reminders",
      help: "Weekly tips, talent spotlights, cart and profile reminders, in the app and by email.",
      on: "Tips and reminders are on.",
      off: "Tips and reminders are off.",
    },
  ],
};

/**
 * Notification settings. Both switches are optional mail only: payments, invoices, interview and account-security
 * messages are always sent and have no switch (the note below says so). Optimistic: the switch moves at once and
 * snaps back with a message if the save fails. The server owns the rules (lib/notify-prefs.ts).
 */
export function NotificationPrefs({ role, initial }: { role: "intern" | "employer"; initial: Prefs }) {
  return (
    <div className="space-y-6">
      {COPY[role].map((c) => (
        <PrefRow key={c.key} item={c} initial={initial[c.key]} />
      ))}
      <p className="text-sm leading-relaxed text-text-subtle">
        Emails about new proposals and offers, payments, invoices, interviews and your account&apos;s security are always sent. They can&apos;t be turned off.
      </p>
    </div>
  );
}

function PrefRow({ item, initial }: { item: (typeof COPY)["intern"][number]; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const labelId = useId();
  const helpId = useId();

  async function flip(next: boolean) {
    const prev = on;
    setOn(next);
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await csrfFetch("/api/notifications/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [item.key]: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setOn(prev);
        setError(body?.error ?? "Could not save. Try again.");
        return;
      }
      setSaved(next ? item.on : item.off);
    } catch {
      setOn(prev);
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4" data-pref={item.key}>
      <div className="min-w-0">
        <p id={labelId} className="text-base font-semibold text-ink-900">
          {item.title}
        </p>
        <p id={helpId} className="mt-1 text-sm leading-relaxed text-ink-600">
          {item.help}
        </p>
        <p role="status" aria-live="polite" className="mt-1 min-h-5 text-sm text-text-subtle">
          {saved}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {saving ? <Loader2 className="size-4 animate-spin text-text-subtle" aria-hidden /> : null}
        <Switch
          checked={on}
          onCheckedChange={flip}
          disabled={saving}
          aria-labelledby={labelId}
          aria-describedby={helpId}
          className="before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        />
      </div>
    </div>
  );
}
