"use client";

/**
 * Proof.
 *
 * A dated statement of something that happened, carrying its facts, and
 * exportable as text. This is where the reward lives.
 *
 * ── Why not confetti ───────────────────────────────────────────────────
 *
 * Because confetti is a reward for the person watching, and it is worthless
 * to the person being watched. A student cannot put confetti on a CV. They
 * can put "26 hours approved by Northwind Labs, 15 September 2026" on a CV.
 *
 * The research on this is unusually direct: rewards read as *information*
 * about your own competence raise intrinsic motivation, and rewards read as
 * *control* over your behaviour reduce it. A card that says "here is what you
 * actually did, and here is the date" is informational. A badge that says
 * "you earned a level" is control wearing a costume. There is no level here,
 * and there is not going to be one.
 *
 * ── Why only these two pieces are client code ──────────────────────────
 *
 * The record itself renders on the server (components/intern/record). The
 * browser gets only what a click needs: one entry's text for Copy, the whole
 * export for Download.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Copy to clipboard with a state that confirms itself, then gets out of the way. */
export function CopyFact({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const shown = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy";

  return (
    <>
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
        window.setTimeout(() => setState("idle"), 2200);
      }}
      className={buttonClass({ variant: "ghost", size: "sm", className: "text-ink-600 hover:text-ink-900" })}
    >
      {state === "copied" ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span className="sr-only">{label}</span>
      <span aria-hidden>{shown}</span>
    </button>
    {/* Outside the button so the result is announced without changing its name. */}
    <span className="sr-only" aria-live="polite">{state === "idle" ? "" : shown}</span>
    </>
  );
}

/**
 * The whole record, as one exportable document.
 *
 * A student needs this as a document, not as a screenshot of a dashboard. A
 * screenshot looks like a product; a plain text file looks like a record, and
 * it pastes cleanly into an email or a document. No ribbon, no share sheet
 * theatre, no export button that opens a modal asking which of nine formats
 * they want.
 */
export function RecordExport({
  filename,
  text,
  className,
}: {
  filename: string;
  text: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setDone(true);
    window.setTimeout(() => setDone(false), 2400);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <button
        type="button"
        onClick={download}
        className={buttonClass({})}
      >
        {done ? <Check className="size-4" aria-hidden /> : <Download className="size-4" aria-hidden />}
        {done ? "Downloaded" : "Download your record"}
      </button>
    </div>
  );
}
