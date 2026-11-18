"use client";

import { useState } from "react";
import { BellRing, Check } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type Kind = "online" | "offer" | "interview";

/**
 * Chase one or many students. The server skips anyone nudged for the same
 * thing in the last 10 minutes and says so, so a double click is harmless.
 */
export function NudgeButton({
  userIds,
  kind,
  label = "Nudge",
  size = "sm",
  emphasis = false,
  className,
}: {
  userIds: string[];
  kind: Kind;
  label?: string;
  size?: "sm" | "xs";
  /** The one action on a board (Nudge all during a live drive): a firmer outline, never louder than the count it acts on. */
  emphasis?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [note, setNote] = useState("");

  async function send() {
    if (!userIds.length || state === "sending") return;
    setState("sending");
    const res = await csrfFetch("/api/college/nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, userIds }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { sent?: number; pushed?: number; skipped?: number; emailed?: boolean; error?: string } | null;
    if (!res?.ok || !body) {
      setState("error");
      setNote(body?.error ?? "Couldn't send. Try again.");
      return;
    }
    setState("done");
    // Say how it travelled: a phone alert reaches them now; the bell only
    // when they next open Findtern. Never imply more reach than happened.
    const sent = body.sent ?? 0;
    const pushed = body.pushed ?? 0;
    const via = body.emailed ? "email and in-app" : "in-app";
    setNote(
      sent === 0
        ? "Already nudged in the last 10 min"
        : [
            `${sent} nudged`,
            pushed ? `${pushed} by phone alert` : null,
            sent - pushed > 0 ? `${sent - pushed} by ${via} only` : null,
            body.skipped ? `${body.skipped} nudged recently` : null,
          ]
            .filter(Boolean)
            .join(" · "),
    );
  }

  const done = state === "done";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={state === "sending" || done || userIds.length === 0}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-default",
          size === "sm" ? "min-h-10 px-3 text-sm max-lg:min-h-11" : "min-h-10 px-2.5 text-xs max-lg:min-h-11",
          done
            ? "border-brand-100 bg-brand-100 text-brand-900"
            : emphasis
              ? "border-ink-900 bg-surface-raised text-ink-900 hover:bg-ink-900 hover:text-paper"
              : "border-ink-300 bg-surface-raised text-ink-800 hover:border-ink-900 hover:bg-ink-100",
          className,
        )}
      >
        {done ? <Check className="size-3.5" aria-hidden /> : <BellRing className="size-3.5" aria-hidden />}
        {state === "sending" ? "Sending…" : done ? "Nudged" : label}
      </button>
      <span role="status" aria-live="polite" className={cn("text-xs", state === "error" ? "text-danger" : "text-ink-600")}>
        {note}
      </span>
    </span>
  );
}
