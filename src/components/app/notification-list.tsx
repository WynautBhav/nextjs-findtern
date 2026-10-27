"use client";

/**
 * The notification list and its mark read actions.
 *
 * This replaces a component that could not work. It used a bare `fetch` with
 * no CSRF header, so pressing "Mark read" returned 403 and did nothing, with
 * no error shown and no state change, which looks identical to a button that
 * is broken. It also had no loading state, so pressing it twice sent two
 * requests and looked stuck.
 *
 * The rewrite keeps the update optimistic, because waiting for a round trip to
 * grey out a row makes the whole screen feel slow, and rolls it back visibly
 * if the request fails rather than silently pretending.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { AlertCircle, ArrowRight, Check, CheckCheck } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date | null;
  /** Optional: where this alert leads (employer alerts). Opening it marks it read. */
  href?: string | null;
};

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
        title={error ?? undefined}
        className={cn(
          "apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-apple-sm border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50 disabled:opacity-45",
          error && "border-danger/40 text-danger",
        )}
      >
        {error ? <AlertCircle className="size-4" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}
        {busy ? "Marking" : error ? "Didn't save - try again" : "Mark everything read"}
      </button>
    );
  }

  async function markOne(id: string) {
    setError(null);
    setRead((prev) => new Set(prev).add(id));
    try {
      const res = await csrfFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (!res.ok) throw new Error("failed");
      startTransition(() => router.refresh());
    } catch {
      setRead((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setError("Could not mark that one as read. It will come back.");
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-apple-sm bg-danger-soft px-4 py-2.5 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-ink-100 overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white shadow-xs">
        {(rows ?? []).map((n) => {
          const isRead = n.isRead || read.has(n.id);
          return (
            <motion.li
              key={n.id}
              initial={false}
              animate={{ opacity: isRead ? 0.72 : 1 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-4 px-5 py-4"
            >
              {!isRead ? (
                <span className="mt-2 size-2 shrink-0 rounded-full bg-accent-500">
                  {/* aria-label is not allowed on a plain span; text is. */}
                  <span className="sr-only">Unread</span>
                </span>
              ) : (
                <span aria-hidden className="mt-2 size-2 shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-pretty",
                    isRead ? "text-sm font-medium text-ink-600" : "text-sm font-semibold text-ink-900",
                  )}
                >
                  {n.href ? (
                    <Link
                      href={n.href}
                      onClick={() => {
                        if (!isRead) void markOne(n.id);
                      }}
                      className="hover:text-brand-700 hover:underline"
                    >
                      {n.title}
                    </Link>
                  ) : (
                    n.title
                  )}
                </p>
                <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-600">{n.message}</p>
                <p className="mt-1.5 text-xs tabular-nums text-ink-600">
                  {n.createdAt
                    ? n.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })
                    : null}
                </p>
              </div>

              {n.href || !isRead ? (
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                  {!isRead ? (
                    <button
                      type="button"
                      onClick={() => markOne(n.id)}
                      aria-label={`Mark "${n.title}" as read`}
                      className="apple-spring apple-pressable inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-apple-sm px-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                    >
                      <Check className="size-3.5" aria-hidden />
                      <span className="hidden sm:inline">Mark read</span>
                    </button>
                  ) : null}
                  {n.href ? (
                    <Link
                      href={n.href}
                      onClick={() => {
                        if (!isRead) void markOne(n.id);
                      }}
                      aria-label={`Open: ${n.title}`}
                      className="apple-spring inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-apple-sm px-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <span className="hidden sm:inline">Open</span>
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}