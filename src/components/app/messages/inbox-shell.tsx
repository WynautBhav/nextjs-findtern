"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { PageHead, Surface } from "@/components/app/primitives";
import { PresenceDot } from "@/components/app/presence-dot";
import { shortDateTime } from "@/lib/format";
import type { ThreadSummary } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * The messages frame for both roles: the conversation list, and beside it
 * (desktop, ≥1024) or instead of it (phone) the open thread. One pane at a
 * time on a phone: the list at /messages, the thread at /messages/[id] with a
 * back link in the thread header.
 */
export function InboxShell({ role, threads, children }: { role: "intern" | "employer"; threads: ThreadSummary[]; children: React.ReactNode }) {
  const open = useSelectedLayoutSegment();
  const base = `/${role}/messages`;
  const proposalsHref = role === "employer" ? "/employer/proposals" : "/intern/proposals";

  return (
    <div>
      <PageHead
        title="Messages"
        lede={role === "employer" ? "Talk to candidates you have sent a proposal to." : "Talk to companies that have sent you a proposal."}
        className={cn(open && "max-lg:hidden")}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <nav aria-label="Conversations" className={cn("min-w-0", open && "max-lg:hidden")}>
          {threads.length === 0 ? (
            <Surface className="p-6">
              <p className="text-base font-semibold text-ink-900">No conversations yet</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                Messaging opens once a proposal is sent. Open a proposal and choose Message.
              </p>
              <Link href={proposalsHref} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
                {role === "employer" ? "Go to proposals" : "Go to offers"}
              </Link>
            </Surface>
          ) : (
            <Surface className="overflow-hidden">
              <ul className="divide-y divide-ink-100">
                {threads.map((t) => {
                  const current = open === t.id;
                  return (
                    <li key={t.id}>
                      <Link
                        href={`${base}/${encodeURIComponent(t.id)}`}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                          current && "bg-brand-50 hover:bg-brand-50",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn("flex min-w-0 items-center gap-2 text-sm", t.unread > 0 ? "font-semibold text-ink-900" : "font-medium text-ink-800")}>
                              <span className="truncate">{t.name}</span>
                              <PresenceDot label={t.presence} />
                            </span>
                            {t.lastAt ? (
                              <time dateTime={t.lastAt} className="nums shrink-0 text-xs text-text-subtle">
                                {shortDateTime(new Date(t.lastAt), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                              </time>
                            ) : null}
                          </span>
                          {t.roleTitle ? <span className="block truncate text-xs text-text-subtle">{t.roleTitle}</span> : null}
                          <span className={cn("mt-0.5 block truncate text-sm", t.unread > 0 ? "text-ink-800" : "text-ink-600")}>
                            {t.preview ? `${t.lastMine ? "You: " : ""}${t.preview}` : "No messages yet"}
                          </span>
                        </span>
                        {t.unread > 0 ? (
                          <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-700">
                            <span className="sr-only">{t.unread} unread</span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Surface>
          )}
        </nav>

        <div className={cn("min-w-0", !open && "max-lg:hidden")}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Desktop placeholder at /messages when the right pane has nothing open. */
export function InboxEmpty({ hasThreads }: { hasThreads: boolean }) {
  return (
    <Surface className="grid min-h-64 place-items-center p-8 text-center">
      <div>
        <MessageSquare aria-hidden className="mx-auto size-6 text-text-subtle" />
        <p className="mt-3 text-base font-semibold text-ink-900">{hasThreads ? "Choose a conversation" : "Nothing here yet"}</p>
        <p className="mt-1 text-sm text-ink-600">
          {hasThreads ? "Pick one from the list to read and reply." : "Conversations appear here after a proposal is sent."}
        </p>
      </div>
    </Surface>
  );
}
