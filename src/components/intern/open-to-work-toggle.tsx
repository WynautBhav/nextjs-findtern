"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useOpenToWork } from "@/components/intern/use-open-to-work";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/**
 * The intern side of the "open to work" filter employers browse by.
 *
 * Off means hidden from the candidate pool (existing proposals, interviews
 * and timesheets are untouched - this only gates discovery). The flag lives
 * in `extra_data.openToWork`; absent counts as on, so nobody who never saw
 * this switch silently disappears.
 *
 * The switch only ever shows the stored state. A press sends the request and the switch (and the copy under it)
 * keeps the old state, dimmed and busy, until the server answers; then it moves. Both directions wait: off must
 * not say "hidden" before it is, and on must not say "visible" before consent is stored. A failed save leaves the
 * true state in place and shows the error. The state is shared with the Home banner (use-open-to-work.ts): a save
 * from either one moves both.
 */
export function OpenToWorkToggle({
  initial,
  brief = false,
}: {
  initial: boolean;
  /** Dashboard: the explainer only while hidden. */
  brief?: boolean;
}) {
  const { on, save } = useOpenToWork(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function flip(next: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const stored = await save(next);
      if (stored === null) setError("Could not save. Try again.");
      else if (stored !== next) setError("Staff have hidden this profile, so it cannot be switched on here.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-base font-semibold text-ink-900">Open to work</p>
        <p className={cn("mt-1 text-sm leading-relaxed text-ink-600", brief && on && "sr-only")}>
          {on
            ? "Employers can find you in the candidate pool. You can hide your profile whenever you need a break."
            : "Hidden from the pool until you switch this back on. Your applications keep going."}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {saving ? <Loader2 className="size-4 animate-spin text-text-subtle" aria-hidden /> : null}
        <span role="status" className="sr-only">
          {saving ? "Saving" : ""}
        </span>
        <Switch
          checked={on}
          onCheckedChange={flip}
          // aria-disabled, not disabled: a disabled button drops keyboard focus mid-save. flip() ignores presses while saving.
          aria-disabled={saving || undefined}
          aria-busy={saving || undefined}
          aria-label="Open to work"
          // The switch looks the same; an invisible 44px square around it is the hit area on every pointer, not only touch.
          className="aria-busy:cursor-progress aria-busy:opacity-60 before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        />
      </div>
    </div>
  );
}
