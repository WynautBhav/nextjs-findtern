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
import { AlertCircle, Check, CheckCheck } from "lucide-react";

import { LIGHT_TILE } from "@/components/app/primitives";
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

export function NotificationList({
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

      {/* By day, newest first; each row then needs only its time. Day labels are h3 under the list's section. */}
      <div className={cn("overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white", LIGHT_TILE)}>
        {byDay(rows ?? [], now ?? mountedAt).map(({ day, items }) => (
          <section key={day} aria-label={day}>
            <h3 className="nums bg-ink-50/70 px-5 py-2 text-xs font-medium text-ink-600">{day}</h3>
            <ul className="divide-y divide-ink-100">
              {items.map((n) => {
                const isRead = n.isRead || read.has(n.id);
                const body = (
                  <>
                    <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", isRead ? "bg-transparent" : "bg-brand-600")} />
                    <span className="min-w-0 flex-1">
                      {/* Title with the time on the right; one quiet line of detail. */}
                      <span className="flex items-baseline justify-between gap-4">
                        <span className={cn("min-w-0 text-pretty text-base", isRead ? "font-medium text-ink-700" : "font-semibold text-ink-900")}>
                          {n.title}
                          {!isRead ? <span className="sr-only"> (unread)</span> : null}
                        </span>
                        {n.createdAt ? (
                          <time dateTime={new Date(n.createdAt).toISOString()} className="nums shrink-0 text-xs text-text-subtle">
                            {shortDateTime(new Date(n.createdAt), TIME)} IST
                          </time>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-pretty text-sm leading-relaxed text-ink-600">{n.message}</span>
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
                        className="flex min-w-0 flex-1 items-start gap-4 py-4 pl-5 pr-14 transition-colors hover:bg-ink-50/80 focus-visible:bg-ink-50/80 focus-visible:-outline-offset-2"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-start gap-4 py-4 pl-5 pr-14">{body}</div>
                    )}
                    {!isRead ? (
                      // Always there on touch; on a pointer it shows on hover or focus.
                      <button
                        type="button"
                        onClick={() => markOne(n.id)}
                        aria-label={`Mark "${n.title}" as read`}
                        title="Mark as read"
                        className="absolute right-2 top-1/2 grid size-10 touch:size-11 focus-visible:-outline-offset-2 -translate-y-1/2 place-items-center rounded-apple-sm text-text-subtle transition-opacity hover:bg-ink-100 hover:text-ink-900 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100"
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
