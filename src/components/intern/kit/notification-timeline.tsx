"use client";

/**
 * The notification list and its mark-read actions.
 *
 * A row with somewhere to go is a link: clicking it marks it read and opens
 * the offer, interview or timesheet it is about (legacy getNotificationHref,
 * INT-15). Marking read is optimistic and rolls back visibly if the request
 * fails rather than silently pretending.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowRight, Check, CheckCheck } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { shortDateTime } from "@/lib/format";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date | null;
  /** Where the row leads; null keeps it a plain message. */
  href?: string | null;
};

const TIME: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
};

export function NotificationTimeline({
  rows,
  mode = "list",
  disabled,
  now,
}: {
  rows?: NotificationRow[];
  mode?: "list" | "mark-all";
  disabled?: boolean;
  /** Reference time for "Today" and "Yesterday"; read once on mount when omitted. */
  now?: Date;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [, startTransition] = useTransition();
  const [read, setRead] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mountedAt] = useState(() => new Date());

  if (mode === "mark-all") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await csrfFetch("/api/notifications/read-all", { method: "POST" });
              if (!res.ok) throw new Error("failed");
              startTransition(() => router.refresh());
            } catch {
              setError("That did not save. Try again in a moment.");
            } finally {
              setBusy(false);
            }
          }}
          className={buttonClass({ variant: "outline" })}
        >
          <CheckCheck className="size-4" aria-hidden />
          {busy ? "Marking…" : "Mark all as read"}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

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
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* A timeline: day on the left, a rail of dots, then the cards. */}
      <div className="space-y-8">
        {byDay(rows ?? [], now ?? mountedAt).map(({ day, items }) => (
          <section key={day} aria-label={day} className="grid gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-6">
            <h2 className="nums text-sm font-semibold text-ink-900 sm:sticky sm:top-24 sm:self-start sm:pt-4">{day}</h2>
            <ul className="relative space-y-2.5 sm:border-l sm:border-ink-200 sm:pl-6">
              {items.map((n, idx) => {
                const isRead = n.isRead || read.has(n.id);
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <span className={cn("min-w-0 text-pretty text-base", isRead ? "font-medium text-ink-700" : "font-semibold text-ink-900")}>
                          {n.title}
                          {!isRead ? <span className="sr-only"> (unread)</span> : null}
                        </span>
                        {n.createdAt ? (
                          <time dateTime={new Date(n.createdAt).toISOString()} className="nums text-xs text-text-subtle sm:shrink-0">
                            {shortDateTime(new Date(n.createdAt), TIME)} IST
                          </time>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-pretty text-sm leading-relaxed text-ink-600">{n.message}</span>
                      {n.href ? (
                        <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                          Open
                          <ArrowRight className="size-3.5" aria-hidden />
                        </span>
                      ) : null}
                    </span>
                  </>
                );
                const card = cn(
                  "flex min-w-0 flex-1 items-start gap-4 rounded-apple-lg px-4 py-4 pr-12 transition-[background-color,box-shadow] sm:pr-14",
                  isRead ? "bg-transparent" : "bg-white shadow-[0_1px_2px_rgb(15_40_30/0.06),0_8px_20px_-12px_rgb(15_40_30/0.2)] ring-1 ring-ink-200/70",
                );
                return (
                  <motion.li
                    key={n.id}
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : Math.min(idx, 8) * 0.04, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="group/row relative flex items-center"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -left-[1.9375rem] top-6 hidden size-2.5 rounded-full ring-4 ring-surface sm:block",
                        isRead ? "bg-ink-300" : "bg-brand-600",
                      )}
                    />
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => {
                          if (!isRead) void markOne(n.id, true);
                        }}
                        className={cn(card, "hover:bg-white hover:ring-1 hover:ring-ink-200 focus-visible:-outline-offset-2")}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={card}>{body}</div>
                    )}
                    {!isRead ? (
                      <button
                        type="button"
                        onClick={() => markOne(n.id)}
                        aria-label={`Mark "${n.title}" as read`}
                        title="Mark as read"
                        className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-apple-sm text-text-subtle transition-opacity hover:bg-ink-100 hover:text-ink-900 focus-visible:-outline-offset-2 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100"
                      >
                        <Check className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </motion.li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "Asia/Kolkata" };

/** Rows grouped by their IST day, in the order given: "Today", "Yesterday", else "27 Oct". */
function byDay(rows: NotificationRow[], now: Date): { day: string; items: NotificationRow[] }[] {
  const key = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = key(now);
  const yesterday = key(new Date(now.getTime() - 86_400_000));
  const out: { day: string; items: NotificationRow[] }[] = [];
  for (const n of rows) {
    const d = n.createdAt ? new Date(n.createdAt) : null;
    const k = d ? key(d) : "";
    const day = !d ? "Earlier" : k === today ? "Today" : k === yesterday ? "Yesterday" : shortDateTime(d, DAY);
    const last = out[out.length - 1];
    if (last?.day === day) last.items.push(n);
    else out.push({ day, items: [n] });
  }
  return out;
}
