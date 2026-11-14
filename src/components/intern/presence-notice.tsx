"use client";

import Link from "next/link";
import { X } from "lucide-react";

import { useDismissed } from "@/hooks/use-dismissed";
import { presenceNoticeKey } from "@/lib/dismissed-keys";

/**
 * One-time heads-up that employers can now see when a student is active. Shown only while the setting is still on
 * (the server passes `on`) and not yet dismissed. Dismissal is remembered per user in this browser's localStorage:
 * the repo has no per-user dismissed-notice store, and adding one needs a migration. The server renders the notice
 * (see useDismissed + DismissedGuard), so it is in the first paint and never pushes the page down afterwards.
 */
export function PresenceNotice({ userId, on }: { userId: string; on: boolean }) {
  const [gone, dismiss] = useDismissed("local", presenceNoticeKey(userId));

  if (!on || gone) return null;
  return (
    <section
      aria-label="Activity visibility"
      data-dismiss="presence"
      suppressHydrationWarning
      className="flex items-start justify-between gap-2 rounded-apple-sm border border-brand-200 bg-brand-50 py-1.5 pl-4 pr-1.5 text-sm text-brand-950 sm:items-center sm:gap-4 sm:py-3 sm:pr-4"
    >
      <p className="min-w-0 py-1.5 leading-snug text-pretty sm:py-0 sm:leading-relaxed">
        Employers can now see when you&apos;re active. Change this anytime in{" "}
        <Link
          href="/intern/settings#privacy"
          className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          Settings → Privacy
        </Link>
        .
      </p>
      {/* A 44 px icon button beside the text below sm (it was a full row under it); the word "Dismiss" returns from sm up. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid size-11 shrink-0 place-items-center rounded-apple-sm text-brand-800 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-600 sm:inline-flex sm:size-auto sm:min-h-11 sm:items-center sm:px-2 sm:font-medium sm:underline-offset-4"
      >
        <X aria-hidden className="size-4 sm:hidden" />
        <span className="max-sm:hidden">Dismiss</span>
      </button>
    </section>
  );
}
