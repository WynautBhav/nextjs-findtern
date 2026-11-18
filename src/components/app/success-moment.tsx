"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * The one celebratory moment (offer accepted, hired, payout sent). A ring and a tick draw
 * themselves (stroke and transform only, 600 ms in all), then the words. It takes focus once so a
 * screen reader hears it, and under reduced motion it is simply there. Use it once per outcome.
 *
 *   <SuccessMoment title="Offer accepted" body="Priya joins Northwind on 3 Dec." actions={<Link ...>} />
 */
export function SuccessMoment({ title, body, actions, className }: { title: string; body?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className={cn("flex items-start gap-5 outline-none", className)}>
      <svg aria-hidden viewBox="0 0 56 56" className="size-14 shrink-0 text-brand-700" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="28" cy="28" r="25" strokeDasharray="157" strokeDashoffset="157" style={{ animation: "app-check-draw 240ms var(--ease-app) forwards" }} transform="rotate(-90 28 28)" />
        <path d="M17 29.5l7.5 7.5L39 21" strokeDasharray="36" strokeDashoffset="36" style={{ animation: "app-check-draw 180ms var(--ease-app) 120ms forwards" }} />
      </svg>
      <div className="min-w-0 pt-1" style={{ animation: "app-page-enter 180ms var(--ease-app) 120ms both" }}>
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h2>
        {body ? <p className="mt-1 max-w-md text-pretty text-base text-ink-700">{body}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
