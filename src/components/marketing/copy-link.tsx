"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

/**
 * Copy-link control.
 *
 * Uses the async clipboard API, falling back to a selection copy where it is
 * unavailable (insecure origins, older Safari) rather than silently doing
 * nothing. The confirmation is announced, because a button that changes
 * appearance with no feedback is indistinguishable from a broken one.
 */
export function CopyLink({ label = "Copy link" }: { label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-sm text-ink-600 transition-colors hover:text-primary"
    >
      {copied ? (
        <Check className="size-3.5 text-primary" aria-hidden />
      ) : (
        <Link2 className="size-3.5" aria-hidden />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}
