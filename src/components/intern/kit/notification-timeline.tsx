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
          className={buttonClass({ variant: "outline", className: "touch:min-h-11" })}
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
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* A ruled timeline: the day on the left, hairline rows on the right. Unread rows carry a "New" word and a heavier title, never colour alone. */}
      <div className="space-y-8">
        {byDay(rows ?? [], now ?? mountedAt).map(({ day, items }) => (
          <section key={day} aria-label={day} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-8">
            <h2 className="font-display text-lg font-semibold text-ink-900 sm:sticky sm:top-24 sm:self-start sm:pt-4">{day}</h2>
            <ul className="min-w-0 divide-y divide-ink-200 border-y border-ink-300">
              {items.map((n) => {
                const isRead = n.isRead || read.has(n.id);
                const body = (
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <span className={cn("min-w-0 text-pretty text-base", isRead ? "font-normal text-ink-700" : "font-semibold text-ink-900")}>
                        {!isRead ? <span className="mr-2 rounded-md bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-900">New</span> : null}
                        {n.title}
                      </span>
                      {n.createdAt ? (
                        <time dateTime={new Date(n.createdAt).toISOString()} className="nums text-xs text-ink-700 sm:shrink-0">
                          {shortDateTime(new Date(n.createdAt), TIME)} IST
                        </time>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-pretty text-sm text-ink-700">{n.message}</span>
                    {n.href ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                        Open
                        <ArrowRight className="size-3.5" aria-hidden />
                      </span>
                    ) : null}
                  </span>
                );
                const row = cn("flex min-w-0 flex-1 items-start gap-4 py-4 pr-12 transition-colors duration-150 sm:pr-14");
                return (
                  <li key={n.id} className="group/row relative flex items-center">
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => {
                          if (!isRead) void markOne(n.id, true);
                        }}
                        className={cn(row, "hover:bg-surface-raised focus-visible:-outline-offset-2")}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={row}>{body}</div>
                    )}
                    {!isRead ? (
                      <button
                        type="button"
                        onClick={() => markOne(n.id)}
                        aria-label={`Mark "${n.title}" as read`}
                        title="Mark as read"
                        className="absolute right-0 top-3 grid size-11 place-items-center rounded-md text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:-outline-offset-2"
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
