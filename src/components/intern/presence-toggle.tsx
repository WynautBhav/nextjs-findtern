"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * The student's own switch for the activity label employers see
 * ("Online now", "Active today", "Active this week"). Never a time. Off hides
 * the label; messages, offers and everything else are unaffected.
 */
export function PresenceToggle({ initialVisible }: { initialVisible: boolean }) {
  const [visible, setVisible] = useState(initialVisible);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const descId = useId();

  async function flip(next: boolean) {
    setVisible(next);
    setSaving(true);
    setError("");
    try {
      const res = await csrfFetch("/api/intern/presence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: next }),
      });
      if (!res.ok) {
        setVisible(!next);
        setError("Could not save. Try again.");
      }
    } catch {
      setVisible(!next);
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 p-5 lg:p-6">
      <div className="min-w-0">
        <p className="text-base font-semibold text-ink-900">Show employers when I&apos;m active</p>
        <p id={descId} className="mt-1 text-sm leading-relaxed text-ink-600">
          {visible
            ? "Employers see “Online now”, “Active today” or “Active this week” beside your profile. They never see an exact time."
            : "Employers see no activity label for you. You can still message and receive offers as usual."}
        </p>
        <p role="status" className="mt-1 text-sm font-medium text-danger empty:hidden">
          {error}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {saving ? <Loader2 className="size-4 animate-spin text-text-subtle motion-reduce:animate-none" aria-hidden /> : null}
        <Switch
          checked={visible}
          onCheckedChange={flip}
          disabled={saving}
          aria-label="Show employers when I'm active"
          aria-describedby={descId}
          className="before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        />
      </div>
    </div>
  );
}
