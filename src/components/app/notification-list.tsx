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
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { AlertCircle, Check, CheckCheck } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date | null;
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
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 transition-[border-color,background-color] duration-[var(--dur-instant)] hover:border-ink-300 hover:bg-ink-50 disabled:opacity-45",
          error && "text-danger",
        )}
      >
        <CheckCheck className="size-4" aria-hidden />
        {busy ? "Marking" : "Mark everything read"}
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
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white">
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
                <span
                  aria-label="Unread"
                  className="mt-2 size-2 shrink-0 rounded-full bg-accent-500"
                />
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
                  {n.title}
                </p>
                <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-600">{n.message}</p>
                <p className="mt-1.5 text-xs text-ink-400">
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

              {!isRead ? (
                <button
                  type="button"
                  onClick={() => markOne(n.id)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-600 transition-colors duration-[var(--dur-instant)] hover:bg-ink-100 hover:text-ink-900"
                >
                  <Check className="size-3.5" aria-hidden />
                  <span className="sr-only sm:not-sr-only">Read</span>
                </button>
              ) : null}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}