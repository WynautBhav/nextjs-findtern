"use client";

import { useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * "Show when I'm active to employers". On by default. Off hides online and last seen from every employer
 * screen; the server applies it (lib/presence.ts), this only writes the setting. The switch only ever shows the
 * stored state: a press keeps the old state, dimmed and busy, until the server confirms, then it moves. Both
 * directions wait, so "off" never reads as hidden before it is. A failed save leaves the true state and the error.
 */
export function ActivityVisibilityToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const labelId = useId();
  const helpId = useId();
  const inFlight = useRef(false);

  async function flip(next: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
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
        setError(body?.error ?? "Could not save. Try again.");
        return;
      }
      setOn(next);
      setSaved(next ? "Employers can see when you're active." : "Employers can no longer see when you're active.");
    } catch {
      setError("Could not save. Try again.");
    } finally {
      inFlight.current = false;
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
          {saving ? "Saving…" : saved}
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
          // aria-disabled, not disabled: a disabled button drops keyboard focus mid-save. flip() ignores presses while saving.
          aria-disabled={saving || undefined}
          aria-busy={saving || undefined}
          aria-labelledby={labelId}
          aria-describedby={helpId}
          className="aria-busy:cursor-progress aria-busy:opacity-60 before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        />
      </div>
    </div>
  );
}
