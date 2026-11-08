"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * One-time heads-up that employers can now see when a student is active. Shown only while the setting is still on
 * (the server passes `on`) and not yet dismissed. Dismissal is remembered per user in this browser's localStorage:
 * the repo has no per-user dismissed-notice store, and adding one needs a migration. Until storage has been read
 * the notice stays hidden, so there is no flash and no layout shift after hydration.
 */
export function PresenceNotice({ userId, on }: { userId: string; on: boolean }) {
  const key = `findtern:presence-notice:${userId}`;
  const [gone, setGone] = useState<boolean | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(key) === "1";
    } catch {
      /* storage blocked: show it, it can still be dismissed for this view */
    }
    const t = setTimeout(() => setGone(dismissed), 0);
    return () => clearTimeout(t);
  }, [key]);

  function dismiss() {
    setGone(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* private mode: dismissed for this view only */
    }
  }

  if (!on || gone !== false) return null;
  return (
    <section
      aria-label="Activity visibility"
      className="flex flex-col gap-1 rounded-apple-sm border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <p className="min-w-0 leading-relaxed text-pretty">
        Employers can now see when you&apos;re active. Change this anytime in{" "}
        <Link
          href="/intern/settings#privacy"
          className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          Settings → Privacy
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="-mx-2 inline-flex min-h-11 shrink-0 items-center self-start rounded-apple-sm px-2 font-medium text-brand-800 underline-offset-4 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-600 sm:mx-0 sm:self-auto"
      >
        Dismiss
      </button>
    </section>
  );
}
