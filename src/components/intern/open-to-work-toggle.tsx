"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { Switch } from "@/components/ui/switch";

/**
 * The intern side of the "open to work" filter employers browse by.
 *
 * Off means hidden from the candidate pool (existing proposals, interviews
 * and timesheets are untouched - this only gates discovery). The flag lives
 * in `extra_data.openToWork`; absent counts as on, so nobody who never saw
 * this switch silently disappears.
 */
export function OpenToWorkToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function flip(next: boolean) {
    setOn(next);
    setSaving(true);
    setError("");
    try {
      const res = await csrfFetch("/api/intern/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openToWork: next }),
      });
      if (!res.ok) {
        setOn(!next);
        setError("Could not save - try again.");
        return;
      }
      router.refresh();
    } catch {
      setOn(!next);
      setError("Could not save - try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-900">Open to work</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-subtle">
          {on
            ? "Employers can find you in the candidate pool."
            : "Hidden from the pool. Your applications keep going."}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-xs font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {saving ? <Loader2 className="size-4 animate-spin text-ink-400" aria-hidden /> : null}
        <Switch checked={on} onCheckedChange={flip} disabled={saving} aria-label="Open to work" />
      </div>
    </div>
  );
}
