"use client";

import Link from "next/link";

import { Avatar } from "@/components/app/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useThreads } from "@/hooks/use-unread";
import { badgeText, counterpartIdentity, relativeTime, truncatePreview } from "@/lib/messaging/ui-logic";
import { cn } from "@/lib/utils";

export function ThreadList({ base, activeId }: { base: "employer" | "intern"; activeId?: string }) {
  const { threads, loaded, error, reload } = useThreads();

  if (!loaded) {
    return (
      <div aria-busy="true" className="divide-y divide-ink-100">
        <span className="sr-only" role="status">
          Loading conversations
        </span>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error && threads.length === 0) {
    return (
      <div role="alert" className="p-4 text-sm text-ink-700">
        <p className="font-medium text-ink-900">Conversations did not load.</p>
        <p className="mt-1 text-text-subtle">Check your connection, then try again.</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="mt-3 inline-flex min-h-11 items-center rounded-apple-sm border border-ink-300 px-4 text-sm font-medium text-ink-900 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          Try again
        </button>
      </div>
    );
  }
  return (
    <ul aria-label="Conversations" className="divide-y divide-ink-100">
      {threads.map((t) => {
        const id = counterpartIdentity(base, t.counterpartId);
        // Ids only: show the short ref just when several threads would otherwise read the same.
        const title = threads.length > 1 ? id.label : id.word;
        const preview = t.lastMessage ? `${t.lastMessage.mine ? "You: " : ""}${truncatePreview(t.lastMessage.body)}` : "No messages yet";
        const active = t.id === activeId;
        const unread = t.unread > 0;
        return (
          <li key={t.id}>
            <Link
              href={`/${base}/messages/${encodeURIComponent(t.id)}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 focus-visible:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700",
                active && "bg-brand-50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand-700",
              )}
            >
              <Avatar masked={base === "employer"} initials={id.initials} name={title} label={title} online={t.counterpartPresence ? t.counterpartOnline : null} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm text-ink-900", unread ? "font-semibold" : "font-medium")}>{title}</span>
                  <time className={cn("nums shrink-0 text-xs", unread ? "font-medium text-brand-700" : "text-text-subtle")} dateTime={t.lastMessageAt ?? undefined}>
                    {relativeTime(t.lastMessage?.createdAt ?? t.lastMessageAt)}
                  </time>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm", unread ? "text-ink-900" : "text-text-subtle")}>{preview}</span>
                  {unread ? (
                    <span className="nums grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-700 px-1.5 text-2xs font-semibold text-white">
                      {badgeText(t.unread)}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
