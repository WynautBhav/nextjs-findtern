"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";

import { MESSAGE_EVENT } from "@/components/app/live-provider";
import { PresenceDot } from "@/components/app/presence-dot";
import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { shortDateTime } from "@/lib/format";
import type { MessageView } from "@/lib/messages";
import type { PresenceLabel } from "@/lib/presence";
import { cn } from "@/lib/utils";

const MAX = 2000;
const POLL_MS = 12_000;

type Outgoing = { clientId: string; body: string; state: "sending" | "failed"; error?: string };

const stamp = (iso: string) => shortDateTime(new Date(iso), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * One conversation: bubbles, "Seen", and the composer. New messages arrive
 * from the live stream (`findtern:message`) with a slow poll as the safety
 * net; the thread marks itself read while it is open and visible. A send is
 * shown at once and keeps its clientId, so Retry after a failure can never
 * post it twice. Enter sends, Shift+Enter makes a new line.
 */
export function ThreadView({
  role,
  threadId,
  initialMessages,
  initialReadAt,
  name,
  roleTitle,
  initialPresence,
  contactLocked,
  closed,
}: {
  role: "intern" | "employer";
  threadId: string;
  initialMessages: MessageView[];
  initialReadAt: string | null;
  name: string;
  roleTitle: string | null;
  initialPresence: PresenceLabel | null;
  contactLocked: boolean;
  closed: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const [readAt, setReadAt] = useState(initialReadAt);
  const [presence, setPresence] = useState(initialPresence);
  const [text, setText] = useState("");
  const [composeError, setComposeError] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const lastId = useRef<string | null>(initialMessages.at(-1)?.id ?? null);
  const pending = useRef(0);
  const noteId = useId();
  const counterId = useId();
  const base = `/api/messages/threads/${encodeURIComponent(threadId)}`;

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    void csrfFetch(`${base}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }, [base]);

  const merge = useCallback((incoming: MessageView[]) => {
    if (incoming.length === 0) return;
    setMessages((cur) => {
      const have = new Set(cur.map((m) => m.id));
      const fresh = incoming.filter((m) => !have.has(m.id));
      if (fresh.length === 0) return cur;
      lastId.current = fresh.at(-1)!.id;
      return [...cur, ...fresh];
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const qs = lastId.current ? `?after=${encodeURIComponent(lastId.current)}` : "";
      const res = await csrfFetch(`${base}${qs}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { messages: MessageView[]; counterpartReadAt: string | null; counterpart: { presence: PresenceLabel | null } };
      // While a send is in flight its own row comes back in the POST reply; the next refresh picks up anything skipped here.
      const incoming = pending.current > 0 ? body.messages.filter((m) => !m.mine) : body.messages;
      merge(incoming);
      setReadAt(body.counterpartReadAt);
      setPresence(body.counterpart.presence);
      if (incoming.some((m) => !m.mine)) markRead();
    } catch {
      // Offline: the next poll retries.
    }
  }, [base, markRead, merge]);

  // Read on open; follow the live stream; poll slowly as a net; catch up when the tab returns.
  useEffect(() => {
    markRead();
    const onMessage = (e: Event) => {
      const id = (e as CustomEvent<{ threadId: string | null }>).detail?.threadId;
      if (!id || id === threadId) void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        markRead();
        void refresh();
      }
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    window.addEventListener(MESSAGE_EVENT, onMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener(MESSAGE_EVENT, onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [threadId, markRead, refresh]);

  // Stay at the newest message unless the reader scrolled up; their own send always scrolls.
  const lastMineOrOut = outbox.length > 0 || messages.at(-1)?.mine;
  useEffect(() => {
    const el = listRef.current;
    if (el && (nearBottom.current || lastMineOrOut)) el.scrollTop = el.scrollHeight;
  }, [messages.length, outbox.length, lastMineOrOut]);

  async function post(item: Outgoing) {
    pending.current += 1;
    setOutbox((o) => o.map((x) => (x.clientId === item.clientId ? { ...x, state: "sending", error: undefined } : x)));
    try {
      const res = await csrfFetch(`${base}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: item.body, clientId: item.clientId }),
      });
      const data = (await res.json().catch(() => null)) as { message?: MessageView; error?: string } | null;
      if (res.ok && data?.message) {
        merge([data.message]);
        setOutbox((o) => o.filter((x) => x.clientId !== item.clientId));
        return;
      }
      const error = data?.error ?? "Could not send. Try again.";
      setOutbox((o) => o.map((x) => (x.clientId === item.clientId ? { ...x, state: "failed", error } : x)));
    } catch {
      setOutbox((o) => o.map((x) => (x.clientId === item.clientId ? { ...x, state: "failed", error: "Could not reach Findtern. Check your connection and retry." } : x)));
    } finally {
      pending.current -= 1;
    }
  }

  function submit() {
    const body = text.trim();
    if (!body) return;
    if (text.length > MAX) {
      setComposeError(`Messages can be up to ${MAX} characters.`);
      return;
    }
    setComposeError("");
    setText("");
    const item: Outgoing = { clientId: crypto.randomUUID(), body, state: "sending" };
    setOutbox((o) => [...o, item]);
    void post(item);
    inputRef.current?.focus();
  }

  const lastMine = [...messages].reverse().find((m) => m.mine);
  const seen = Boolean(lastMine && readAt && new Date(readAt).getTime() >= new Date(lastMine.createdAt).getTime());
  const left = MAX - text.length;

  return (
    <Surface as="section" aria-label={`Conversation with ${name}`} className="flex h-[min(42rem,calc(100dvh-14rem))] min-h-[24rem] flex-col overflow-hidden lg:h-[calc(100dvh-15rem)]">
      <header className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
        <Link
          href={`/${role}/messages`}
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-apple-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
        >
          <ArrowLeft aria-hidden className="size-5" />
          <span className="sr-only">All messages</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <span className="truncate">{name}</span>
            <PresenceDot label={presence} withText />
          </h2>
          {roleTitle ? <p className="truncate text-sm text-text-subtle">{roleTitle}</p> : null}
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        // A log: new messages are announced politely, history is not re-read.
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages"
        tabIndex={0}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {messages.length === 0 && outbox.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-600">No messages yet. Say hello.</p>
        ) : null}
        {messages.map((m) => (
          <Bubble key={m.id} mine={m.mine} body={m.body} at={m.createdAt} footer={m === lastMine && seen ? "Seen" : null} />
        ))}
        {outbox.map((o) => (
          <div key={o.clientId} className="flex flex-col items-end gap-1">
            <Bubble mine body={o.body} at={null} footer={o.state === "sending" ? "Sending…" : null} dim />
            {o.state === "failed" ? (
              <p role="alert" className="flex flex-wrap items-center justify-end gap-x-3 text-sm text-danger">
                <span>{o.error}</span>
                <button type="button" onClick={() => void post(o)} className="min-h-11 font-medium underline underline-offset-4">
                  Retry
                </button>
                <button type="button" onClick={() => setOutbox((x) => x.filter((y) => y.clientId !== o.clientId))} className="min-h-11 font-medium underline underline-offset-4">
                  Discard
                </button>
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {closed ? (
        <p className="border-t border-ink-100 px-4 py-3 text-sm text-ink-600">This conversation is closed.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="border-t border-ink-100 p-3"
        >
          {contactLocked ? (
            <p id={noteId} className="mb-2 text-xs leading-relaxed text-ink-600">
              Phone numbers, emails and links are hidden until the hire is paid.
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (composeError) setComposeError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              maxLength={MAX}
              aria-label="Write a message"
              aria-describedby={contactLocked ? `${counterId} ${noteId}` : counterId}
              aria-invalid={Boolean(composeError)}
              placeholder="Write a message"
              className="max-h-40 min-h-12 w-full resize-none rounded-apple-sm border border-ink-200 bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
            />
            <button type="submit" disabled={!text.trim()} className={buttonClass({ variant: "primary", size: "md", className: "shrink-0" })}>
              <Send aria-hidden className="size-4" />
              Send
            </button>
          </div>
          <p id={counterId} className={cn("mt-1 text-xs nums", left < 100 ? "text-danger" : "text-text-subtle")}>
            {composeError || (left < 200 ? `${left} characters left` : "Enter to send, Shift+Enter for a new line")}
          </p>
        </form>
      )}
    </Surface>
  );
}

function Bubble({ mine, body, at, footer, dim = false }: { mine: boolean; body: string; at: string | null; footer: string | null; dim?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <p
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-apple-lg px-3.5 py-2 text-base leading-relaxed sm:max-w-[75%]",
          mine ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-900",
          dim && "opacity-70",
        )}
      >
        {body}
      </p>
      <p className="flex items-center gap-2 text-xs text-text-subtle">
        {at ? (
          <time dateTime={at} className="nums">
            {stamp(at)}
          </time>
        ) : null}
        {footer ? <span>{footer}</span> : null}
      </p>
    </div>
  );
}
