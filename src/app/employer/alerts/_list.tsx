"use client";

/**
 * The alerts ledger: grouped by day (newest first), one ruled row per alert with its time in a column of its own, so a
 * day reads like a statement. A row with somewhere to go is a link: opening it marks it read (the request outlives the
 * navigation). The tick marks one read without leaving; both roll back visibly if the request fails.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check } from "lucide-react";

import type { NotificationRow } from "@/components/app/notification-list";
import { csrfFetch } from "@/lib/client-fetch";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
const DAY: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

export function AlertsList({ rows }: { rows: NotificationRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [read, setRead] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [mountedAt] = useState(() => new Date());

  async function markOne(id: string, navigating = false) {
    setError(null);
    setRead((prev) => new Set(prev).add(id));
    try {
      // keepalive lets the request finish while the link navigates away.
      const res = await csrfFetch(`/api/notifications/${id}/read`, { method: "PATCH", keepalive: true });
      if (!res.ok) throw new Error("failed");
      if (!navigating) startTransition(() => router.refresh());
    } catch {
      if (navigating) return;
      setRead((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setError("Could not mark that one as read. Try again.");
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 flex items-center gap-2 border-y border-danger/40 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {byDay(rows, mountedAt).map(({ day, unread, items }) => (
        <section key={day} aria-label={day} className="mb-10 last:mb-0">
          <h2 className="mb-1 flex items-baseline gap-3 border-b border-ink-200 pb-2 font-display text-lg font-semibold text-ink-900">
            {day}
            {unread > 0 ? <span className="nums font-sans text-sm font-medium text-[#9a4a08]">{unread} unread</span> : null}
          </h2>
          <ul className="divide-y divide-ink-200 border-b border-ink-200">
            {items.map((n) => {
              const isRead = n.isRead || read.has(n.id);
              const body = (
                <>
                  {n.createdAt ? (
                    <time dateTime={new Date(n.createdAt).toISOString()} className="nums shrink-0 text-sm text-ink-700 sm:w-[4.75rem] sm:pt-0.5">
                      {shortDateTime(new Date(n.createdAt), TIME)}
                    </time>
                  ) : (
                    <span className="shrink-0 sm:w-[4.75rem]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-pretty text-base text-ink-900", isRead ? "font-medium" : "font-semibold")}>
                      {!isRead ? <span aria-hidden className="mr-2 inline-block size-2 rounded-full bg-signal align-middle" /> : null}
                      {n.title}
                      {!isRead ? <span className="sr-only"> (unread)</span> : null}
                    </span>
                    <span className="mt-0.5 block text-pretty text-sm leading-relaxed text-ink-700">{n.message}</span>
                  </span>
                </>
              );
              return (
                <li key={n.id} className="group/row relative flex items-center">
                  {n.href ? (
                    <Link
                      href={n.href}
                      onClick={() => {
                        if (!isRead) void markOne(n.id, true);
                      }}
                      className="flex min-h-11 min-w-0 flex-1 flex-col items-start gap-1 py-4 pr-14 sm:flex-row sm:gap-4 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/40 focus-visible:bg-ink-200/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1 py-4 pr-14 sm:flex-row sm:gap-4">{body}</div>
                  )}
                  {!isRead ? (
                    // Always there on touch; on a pointer it shows on hover or focus.
                    <button
                      type="button"
                      onClick={() => markOne(n.id)}
                      aria-label={`Mark "${n.title}" as read`}
                      title="Mark as read"
                      className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-md text-ink-700 transition-opacity hover:bg-ink-200/60 hover:text-ink-900 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100"
                    >
                      <Check className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Rows grouped by their IST day, in the order given: "Today", "Yesterday", else "Tue 17 Nov". */
function byDay(rows: NotificationRow[], now: Date): { day: string; unread: number; items: NotificationRow[] }[] {
  const key = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = key(now);
  const yesterday = key(new Date(now.getTime() - 86_400_000));
  const out: { day: string; unread: number; items: NotificationRow[] }[] = [];
  for (const n of rows) {
    const d = n.createdAt ? new Date(n.createdAt) : null;
    const k = d ? key(d) : "";
    const day = !d ? "Earlier" : k === today ? "Today" : k === yesterday ? "Yesterday" : shortDateTime(d, DAY);
    const last = out[out.length - 1];
    if (last?.day === day) {
      last.items.push(n);
      if (!n.isRead) last.unread += 1;
    } else out.push({ day, unread: n.isRead ? 0 : 1, items: [n] });
  }
  return out;
}
