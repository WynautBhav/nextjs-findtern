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
  /** The one thing to do on the screen (Nudge all during a live drive): amber. */
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
          "apple-spring apple-pressable inline-flex items-center gap-1.5 rounded-apple-sm border font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-default",
          size === "sm" ? "min-h-11 px-3 text-sm" : "min-h-11 px-2.5 text-xs",
          done
            ? "border-brand-200 bg-brand-50 text-brand-800"
            : emphasis
              ? "border-transparent bg-accent text-brand-950 shadow-sm hover:bg-accent-600 hover:text-white [&_svg]:text-current"
              : "border-ink-200 bg-white text-ink-800 shadow-2xs hover:border-ink-300 hover:bg-ink-50",
          className,
        )}
      >
        {done ? <Check className="size-3.5" aria-hidden /> : <BellRing className="size-3.5 text-brand-700" aria-hidden />}
        {state === "sending" ? "Sending…" : done ? "Nudged" : label}
      </button>
      <span role="status" aria-live="polite" className={cn("text-xs", state === "error" ? "text-danger" : "text-text-subtle")}>
        {note}
      </span>
    </span>
  );
}
