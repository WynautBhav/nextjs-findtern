"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

/**
 * One copy button for the college screens (there were two). A copy that
 * fails (no clipboard permission, an http page) says so instead of doing
 * nothing; the text is on screen to select by hand.
 */
export function CopyText({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2500);
      }}
      className={buttonClass({ variant: primary && state === "idle" ? "primary" : "outline", size: "sm" })}
    >
      {state === "done" ? <Check className="size-4 text-brand-700" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{state === "done" ? "Copied" : state === "failed" ? "Couldn't copy: select it instead" : label}</span>
    </button>
  );
}
