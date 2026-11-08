"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * "Show when I'm active to employers". On by default. Off hides online and last seen from every employer
 * screen; the server applies it (lib/presence.ts), this only writes the setting. Optimistic: the switch moves at
 * once and snaps back with a message if the save fails.
 */
export function ActivityVisibilityToggle({ initial }: { initial: boolean }) {
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
      const res = await csrfFetch("/api/intern/presence-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showActivity: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setOn(prev);
        setError(body?.error ?? "Could not save. Try again.");
        return;
      }
      setSaved(next ? "Employers can see when you're active." : "Employers can no longer see when you're active.");
    } catch {
      setOn(prev);
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id={labelId} className="text-base font-semibold text-ink-900">
          Show when I&apos;m active to employers
        </p>
        <p id={helpId} className="mt-1 text-sm leading-relaxed text-ink-600">
          Employers see whether you&apos;re online and when you were last seen only while this is on. Turn it off and they see nothing.
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
