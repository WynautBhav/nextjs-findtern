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
import { AlertCircle, Check, CheckCheck, ChevronRight } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

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

const when = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

export function NotificationList({
  rows,
  mode = "list",
  disabled,
}: {
  rows?: NotificationRow[];
  mode?: "list" | "mark-all";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [read, setRead] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

      <ul className="divide-y divide-ink-100 overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white shadow-xs">
        {(rows ?? []).map((n) => {
          const isRead = n.isRead || read.has(n.id);
          const body = (
            <>
              <span
                aria-hidden
                className={cn("mt-2 size-2 shrink-0 rounded-full", isRead ? "bg-transparent" : "bg-accent-500")}
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-pretty text-[0.9375rem]", isRead ? "font-medium text-ink-700" : "font-semibold text-ink-900")}>
                  {n.title}
                  {!isRead ? <span className="sr-only"> (unread)</span> : null}
                </span>
                <span className="mt-1 block text-pretty text-sm leading-relaxed text-ink-600">{n.message}</span>
                {n.createdAt ? (
                  <time dateTime={new Date(n.createdAt).toISOString()} className="nums mt-1.5 block text-xs text-ink-500">
                    {when.format(new Date(n.createdAt))} IST
                  </time>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={n.id} className={cn("flex items-stretch", isRead && "bg-ink-50/40")}>
              {n.href ? (
                <Link
                  href={n.href}
                  onClick={() => {
                    if (!isRead) void markOne(n.id, true);
                  }}
                  className="group flex min-w-0 flex-1 items-start gap-4 px-5 py-4 transition-colors hover:bg-ink-50/80 focus-visible:bg-ink-50/80"
                >
                  {body}
                  <ChevronRight className="mt-1 size-4 shrink-0 text-ink-300 group-hover:text-brand-700" aria-hidden />
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-start gap-4 px-5 py-4">{body}</div>
              )}
              {!isRead ? (
                <button
                  type="button"
                  onClick={() => markOne(n.id)}
                  aria-label={`Mark "${n.title}" as read`}
                  className="flex min-w-14 shrink-0 items-center justify-center border-l border-ink-100 px-3 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                >
                  <Check className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
