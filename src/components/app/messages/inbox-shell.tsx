"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { Building2, MessageSquare } from "lucide-react";

import { EmptyScene, PageHead, Surface } from "@/components/app/primitives";
import { shortDateTime } from "@/lib/format";
import type { ThreadSummary } from "@/lib/messages";
import { cn } from "@/lib/utils";

/** Matches COMPANY_MASK in lib/messages (a server module, so not imported here). */
const MASKED_COMPANY = "A company on Findtern";

/** "HD" stays "HD"; "Asha Rao" becomes "AR"; a single word gives its first two letters. */
function tileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

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
        <nav aria-label="Conversations" className={cn("min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto", open && "max-lg:hidden")}>
          {threads.length === 0 ? (
            <EmptyScene
              title="No conversations yet"
              body="Messaging opens once a proposal is sent. Open a proposal and choose Message."
              next={{ label: role === "employer" ? "Go to proposals" : "Go to offers", href: proposalsHref }}
              who={role === "employer" ? "You - send a proposal first" : "A company - waiting on their offer"}
            />
          ) : (
            <ul className="divide-y divide-ink-100 border-y border-ink-100">
              {threads.map((t) => {
                const current = open === t.id;
                return (
                  <li key={t.id}>
                    <Link
                      href={`${base}/${encodeURIComponent(t.id)}`}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex min-h-16 items-start gap-3 px-2 py-3 hover:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        current && "bg-brand-50 hover:bg-brand-50",
                      )}
                    >
                      <span className="relative shrink-0">
                        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800">
                          {t.name === MASKED_COMPANY ? <Building2 className="size-5" /> : tileInitials(t.name)}
                        </span>
                        {t.presence ? (
                          <span
                            aria-hidden
                            title={t.presence}
                            className={cn("absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-white", t.presence === "Online now" ? "bg-success" : "bg-ink-300")}
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-sm", t.unread > 0 ? "font-semibold text-ink-900" : "font-medium text-ink-800")}>
                            {t.name}
                            {t.presence ? <span className="sr-only">, {t.presence}</span> : null}
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
                        <span className="nums mt-0.5 grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-700 px-1.5 text-xs font-semibold text-white">
                          <span aria-hidden>{t.unread > 9 ? "9+" : t.unread}</span>
                          <span className="sr-only">{t.unread} unread</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
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
