"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { validateAiLink } from "@/lib/admin/ai-link-queue";
import { inlineFieldClass } from "@/components/admin/inline-control";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Paste-and-save for one AI interview link, through the existing meeting-link route. Refreshes the page on success. */
export function AiLinkAction({ interviewId, current = "", label = "Add link" }: { interviewId: string; current?: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = value.trim() ? validateAiLink(value) : null;
  const warning = check?.ok ? check.warning : null;

  async function save() {
    const v = validateAiLink(value);
    if (!v.ok) return setError(v.error);
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/interviews/${encodeURIComponent(interviewId)}/meeting-link`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingLink: v.link }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save the link.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the link.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(buttonClass({ variant: "primary", size: "sm" }), "min-h-11 max-sm:w-full")}>
        {label}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="w-full min-w-0 space-y-2"
    >
      <label className="sr-only" htmlFor={`ai-link-${interviewId}`}>InCruiter interview link</label>
      <input
        id={`ai-link-${interviewId}`}
        type="url"
        inputMode="url"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://… InCruiter interview link"
        className={inlineFieldClass}
      />
      {warning ? <p className="text-xs text-warning">{warning}</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={cn(buttonClass({ variant: "primary", size: "sm" }), "min-h-11 flex-1 sm:flex-none")}>
          {busy ? "Saving…" : "Save and notify"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
