"use client";

import { useEffect, useState } from "react";

/** Copies the Findtern ID for a support email; says so, or says what to do instead. */
export function CopyIdButton({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Copy
        <span className="sr-only"> Findtern ID</span>
      </button>
      <span role="status" className="text-xs text-ink-600">
        {state === "copied" ? "Copied" : state === "failed" ? "Select and copy it instead" : ""}
      </span>
    </span>
  );
}
