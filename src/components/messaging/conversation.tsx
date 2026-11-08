"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowDown, ExternalLink } from "lucide-react";

import { Avatar } from "@/components/app/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { csrfFetch } from "@/lib/client-fetch";
import { MAX_BODY } from "@/lib/messaging/logic";
import {
  failSent,
  counterpartIdentity,
  groupByDay,
  senderRuns,
  markMineRead,
  mergeMessages,
  reconcileSent,
  removeMsg,
  statusText,
  type Msg,
} from "@/lib/messaging/ui-logic";
import { setOpenThread, subscribeMessageEvents, useThreads } from "@/hooks/use-unread";
import { cn } from "@/lib/utils";
import { PresenceDot } from "./avatar";

const NEAR_BOTTOM = 80;

export function Conversation({ base, threadId }: { base: "employer" | "intern"; threadId: string }) {
  const { threads } = useThreads();
  const thread = threads.find((t) => t.id === threadId);
  const ident = counterpartIdentity(base, thread?.counterpartId ?? threadId);
  const who = thread ? ident.label : ident.word;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [offline, setOffline] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const stick = useRef(true);
  const seq = useRef(0);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    void csrfFetch(`/api/threads/${encodeURIComponent(threadId)}/read`, { method: "POST" }).catch(() => {});
    setOpenThread(threadId);
  }, [threadId]);

  const load = useCallback(async () => {
    try {
      const r = await csrfFetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, { cache: "no-store" });
      if (r.status === 404) return setStatus("missing");
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { messages: Msg[] };
      setMsgs((cur) => mergeMessages(cur.filter((m) => m.pending || m.failed), j.messages));
      setStatus("ready");
      setOffline(false);
      markRead();
    } catch {
      setStatus((s) => (s === "ready" ? s : "error"));
      setOffline(true);
    }
  }, [threadId, markRead]);

  useEffect(() => {
    setOpenThread(threadId);
    const t = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(t);
      setOpenThread(null);
    };
  }, [threadId, load]);

  // Focus moves to the conversation heading when a thread opens.
  useEffect(() => {
    if (status === "ready") heading.current?.focus();
  }, [status === "ready", threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = () => {
      setOffline(false);
      void load();
    };
    const off = () => setOffline(true);
    const vis = () => {
      if (document.visibilityState === "visible") markRead();
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load, markRead]);

  useEffect(
    () =>
      subscribeMessageEvents((e) => {
        const d = (e.data ?? {}) as { threadId?: string };
        if (d.threadId !== threadId) return;
        if (e.type === "message.new") {
          void load().then(() => setAnnounce(`New message from ${who}`));
        } else if (e.type === "message.read") {
          setMsgs((cur) => markMineRead(cur));
        }
      }),
    [threadId, load, who],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    stick.current = near;
    setAtBottom(near);
  };
  const jump = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
    stick.current = true;
    setAtBottom(true);
  };

  const send = useCallback(
    async (body: string, retryId?: string) => {
      const tempId = retryId ?? `tmp-${Date.now()}-${seq.current++}`;
      const now = new Date().toISOString();
      setSending(true);
      stick.current = true;
      setMsgs((cur) =>
        retryId
          ? cur.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m))
          : [...cur, { id: tempId, mine: true, body, createdAt: now, deliveredAt: null, readAt: null, pending: true }],
      );
      try {
        const r = await csrfFetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { message: Msg };
        setMsgs((cur) => reconcileSent(cur, tempId, j.message));
      } catch {
        setMsgs((cur) => failSent(cur, tempId));
      } finally {
        setSending(false);
      }
    },
    [threadId],
  );

  const submit = () => {
    const body = text.trim();
    if (!body || sending || body.length > MAX_BODY) return;
    setText("");
    void send(body);
  };

  const groups = groupByDay(msgs);
  const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const proposalHref = thread?.proposalId ? (base === "employer" ? `/employer/proposal/${encodeURIComponent(thread.proposalId)}` : `/intern/proposals/${encodeURIComponent(thread.proposalId)}`) : null;

  return (
    <section aria-label="Conversation" className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-16 items-center gap-3 border-b border-ink-100 bg-white/80 px-3 py-2 backdrop-blur sm:px-5">
        <Link href={`/${base}/messages`} className="grid size-11 shrink-0 place-items-center rounded-apple-sm text-ink-600 hover:bg-ink-100 lg:hidden" aria-label="Back to conversations">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <Avatar masked={base === "employer"} initials={ident.initials} name={who} label={who} size="sm" />
        <div className="min-w-0 flex-1">
          <h1 ref={heading} tabIndex={-1} className="truncate text-base font-semibold leading-tight text-ink-900 outline-none">
            {who}
          </h1>
          <div className="flex items-center gap-2">
            {thread ? <PresenceDot online={thread.counterpartOnline} label={thread.counterpartPresence} /> : null}
            {offline ? (
              <span role="status" className="text-xs text-text-subtle">
                · Reconnecting…
              </span>
            ) : null}
          </div>
        </div>
        {proposalHref ? (
          <Link href={proposalHref} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-apple-sm px-3 max-sm:min-w-11 max-sm:justify-center max-sm:px-0 text-sm font-medium text-brand-700 hover:bg-brand-50">
            <span className="max-sm:sr-only">View proposal</span>
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} tabIndex={0} role="log" aria-label={`Messages with ${who}`} className="h-full space-y-6 overflow-y-auto overscroll-contain bg-ink-50/50 px-4 py-5 focus-visible:-outline-offset-2 sm:px-6">
          {status === "loading" ? (
            <div aria-busy="true" className="space-y-3">
              <span className="sr-only">Loading messages</span>
              <Skeleton className="h-10 w-2/3 rounded-apple-sm" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-apple-sm" />
              <Skeleton className="h-10 w-3/5 rounded-apple-sm" />
            </div>
          ) : null}
          {status === "error" ? (
            <p role="alert" className="text-sm text-ink-700">
              Could not load messages. Check your connection, then{" "}
              <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-2">
                try again
              </button>
              .
            </p>
          ) : null}
          {status === "missing" ? <p className="text-sm text-text-subtle">This conversation was not found. It may have been closed.</p> : null}
          {groups.map((g) => (
            <div key={g.key} className="space-y-3">
              <p className="text-center">
                <span className="nums inline-block rounded-full border border-ink-200/70 bg-white px-3 py-1 text-xs font-medium text-ink-700">{g.label}</span>
              </p>
              {senderRuns(g.items).map((run) => {
                const lastIdx = run.items.length - 1;
                return (
                  <div key={run.items[0].id} className={cn("flex min-w-0 flex-col gap-1", run.mine ? "items-end" : "items-start")}>
                    {run.items.map((m, i) => (
                      <div key={m.id} className={cn("group flex min-w-0 max-w-[85%] flex-col sm:max-w-[75%]", run.mine ? "items-end" : "items-start")}>
                        <p
                          tabIndex={0}
                          className={cn(
                            "max-w-full whitespace-pre-wrap rounded-[1.125rem] px-4 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-brand-700",
                            run.mine
                              ? cn("bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-[0_2px_8px_-3px_rgba(6,40,28,0.45)]", i === lastIdx && "rounded-br-md")
                              : cn("border border-ink-200/70 bg-white text-ink-900 shadow-[0_1px_2px_rgba(16,40,30,0.05)]", i === lastIdx && "rounded-bl-md"),
                            m.pending && "opacity-70",
                            m.failed && "ring-2 ring-danger",
                          )}
                        >
                          <span className="sr-only">{run.mine ? "You: " : `${who}: `}</span>
                          {m.body}
                        </p>
                        <p
                          className={cn(
                            "nums mt-0.5 text-xs text-text-subtle",
                            i !== lastIdx && !m.failed && "sr-only group-hover:not-sr-only group-focus-within:not-sr-only",
                          )}
                        >
                          <time dateTime={m.createdAt}>{clock(m.createdAt)}</time>
                          {m.mine ? <> · {statusText(m)}</> : null}
                          {m.failed ? (
                            <>
                              {" · "}
                              <button type="button" onClick={() => void send(m.body, m.id)} className="inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-2">
                                Retry
                              </button>
                              {" · "}
                              <button type="button" onClick={() => setMsgs((cur) => removeMsg(cur, m.id))} className="inline-flex min-h-11 items-center underline underline-offset-2">
                                Discard
                              </button>
                            </>
                          ) : null}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {!atBottom ? (
          <button type="button" onClick={jump} className="absolute bottom-3 right-4 inline-flex min-h-11 items-center gap-1 rounded-full bg-ink-900 px-4 text-sm font-medium text-white shadow-md">
            <ArrowDown className="size-4" aria-hidden /> Jump to latest
          </button>
        ) : null}
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>

      <form
        className="border-t border-ink-100 bg-white p-3 sm:px-5 sm:py-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="msg-composer" className="sr-only">
          Message to {who}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="msg-composer"
            value={text}
            rows={1}
            maxLength={MAX_BODY}
            disabled={sending || status === "missing"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            aria-describedby="msg-hint"
            placeholder="Write a message"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-[1.375rem] border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 transition-colors focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-brand-700 disabled:opacity-60"
          />
          <button type="submit" disabled={sending || !text.trim()} className="min-h-11 rounded-full bg-brand-700 px-6 text-sm font-semibold text-white transition-[transform,opacity] active:scale-95 motion-reduce:transition-none disabled:opacity-50">
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        <p id="msg-hint" className="nums mt-1.5 hidden text-xs text-text-subtle sm:block">
          Enter to send, Shift+Enter for a new line · {text.length}/{MAX_BODY}
        </p>
      </form>
    </section>
  );
}
