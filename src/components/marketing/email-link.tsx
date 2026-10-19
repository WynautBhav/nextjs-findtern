"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { SITE } from "@/lib/content/site";
import { cn } from "@/lib/utils";

/**
 * The contact address, as something that obviously works.
 *
 * A bare `mailto:` link in subtle grey read as plain text, and on a machine
 * with no mail app configured clicking it does nothing at all. So the
 * address is underlined like every other link, opens the visitor's mail app
 * when there is one, and carries a copy button for when there is not.
 */
export function EmailLink({
  email = SITE.email,
  subject,
  tone = "light",
  className,
}: {
  email?: string;
  subject?: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const href = `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context or permissions): the link still works.
    }
  }

  const dark = tone === "dark";
  return (
    <span className={cn("inline-flex items-center gap-1 align-baseline", className)}>
      <a
        href={href}
        className={cn(
          "font-medium underline decoration-1 underline-offset-4 transition-colors",
          dark
            ? "text-white decoration-white/40 hover:decoration-white"
            : "text-primary decoration-brand-300 hover:decoration-primary",
        )}
      >
        {email}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Email address copied" : `Copy ${email}`}
        title={copied ? "Copied" : "Copy address"}
        className={cn(
          "inline-grid size-8 shrink-0 place-items-center rounded-md transition-colors",
          dark ? "text-on-dark-subtle hover:bg-white/10 hover:text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-800",
        )}
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}
