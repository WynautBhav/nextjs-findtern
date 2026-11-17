"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/** A value with a 44px copy button next to it. The confirmation is announced (polite) and fades back after two seconds. */
export function CopyValue({ value, label, className }: { value: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!value) return <span className="text-text-subtle">Not given</span>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1", className)}>
      <span className="min-w-0 break-words">{value}</span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        className="-my-2 grid size-11 shrink-0 place-items-center rounded-full text-text-subtle outline-none transition-colors hover:bg-ink-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring sm:size-9"
      >
        {state === "copied" ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
      <span role="status" aria-live="polite" className={cn("text-xs", state === "failed" ? "text-danger" : "text-success", state === "idle" && "sr-only")}>
        {state === "copied" ? `Copied ${label}` : state === "failed" ? "Couldn't copy" : ""}
      </span>
    </span>
  );
}
