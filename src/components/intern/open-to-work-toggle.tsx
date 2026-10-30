"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/**
 * The intern side of the "open to work" filter employers browse by.
 *
 * Off means hidden from the candidate pool (existing proposals, interviews
 * and timesheets are untouched - this only gates discovery). The flag lives
 * in `extra_data.openToWork`; absent counts as on, so nobody who never saw
 * this switch silently disappears.
 */
export function OpenToWorkToggle({
  initial,
  visibleAgainAt = null,
  brief = false,
}: {
  initial: boolean;
  /** Dashboard: the explainer only while hidden, when it carries a date. */
  brief?: boolean;
  /** ISO time the 30-day hiding limit runs out (only while hidden). */
  visibleAgainAt?: string | null;
}) {
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
        setError("Could not save. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setOn(!next);
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold text-ink-900">Open to work</p>
        <p className={cn("mt-1 text-sm leading-relaxed text-ink-600", brief && on && "sr-only")}>
          {on
            ? "Employers can find you in the candidate pool. You can hide for up to 30 days at a time."
            : visibleAgainAt
              ? `Hidden from the pool. You'll be visible again on ${shortDate(new Date(visibleAgainAt), { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}. Hiding is limited to 30 days.`
              : "Hidden from the pool for up to 30 days. Your applications keep going."}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {saving ? <Loader2 className="size-4 animate-spin text-text-subtle" aria-hidden /> : null}
        <Switch checked={on} onCheckedChange={flip} disabled={saving} aria-label="Open to work" />
      </div>
    </div>
  );
}
