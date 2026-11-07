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
        <span className="sr-only">Loading conversations</span>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2 rounded-apple-sm" />
              <Skeleton className="h-3.5 w-4/5 rounded-apple-sm" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error && threads.length === 0) {
    return (
      <div role="alert" className="p-4 text-sm text-ink-700">
        Could not load conversations. Check your connection, then{" "}
        <button type="button" onClick={() => void reload()} className="inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-2">
          try again
        </button>
        .
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
        return (
          <li key={t.id}>
            <Link
              href={`/${base}/messages/${encodeURIComponent(t.id)}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[4.75rem] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 focus-visible:bg-ink-50 focus-visible:-outline-offset-2",
                active && "bg-brand-50/70 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-brand-600",
                t.unread > 0 && !active && "bg-brand-50/30",
              )}
            >
              <Avatar masked={base === "employer"} initials={id.initials} name={title} label={title} online={t.counterpartOnline} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm text-ink-900", t.unread > 0 ? "font-semibold" : "font-medium")}>{title}</span>
                  <time className="nums shrink-0 text-xs text-text-subtle" dateTime={t.lastMessageAt ?? undefined}>
                    {relativeTime(t.lastMessage?.createdAt ?? t.lastMessageAt)}
                  </time>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm", t.unread > 0 ? "font-medium text-ink-800" : "text-text-subtle")}>{preview}</span>
                  {t.unread > 0 ? (
                    <span className="nums grid min-w-5 shrink-0 place-items-center rounded-full bg-brand-700 px-1.5 py-0.5 text-2xs font-semibold text-white">
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
