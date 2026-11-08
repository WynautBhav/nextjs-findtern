"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowDown, ChevronRight, SendHorizontal } from "lucide-react";

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
  durationLabel,
  proposalStatusLabel,
  statusText,
  type Msg,
  type ProposalCardData,
} from "@/lib/messaging/ui-logic";
import { setOpenThread, subscribeMessageEvents, useThreads } from "@/hooks/use-unread";
import { cn } from "@/lib/utils";
import { PresenceDot } from "./avatar";

const NEAR_BOTTOM = 80;

export function Conversation({ base, threadId, proposal = null }: { base: "employer" | "intern"; threadId: string; proposal?: ProposalCardData | null }) {
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
  // First unread message of the other side, fixed on the first load so the divider stays put once the thread is marked read.
  const [newFromId, setNewFromId] = useState<string | null>(null);
  const seenFirstLoad = useRef(false);

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
      if (!seenFirstLoad.current) {
        seenFirstLoad.current = true;
        setNewFromId(j.messages.find((m) => !m.mine && !m.readAt)?.id ?? null);
      }
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
    seenFirstLoad.current = false;
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

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  const proposalHref = proposal ? (base === "employer" ? `/employer/proposal/${encodeURIComponent(proposal.id)}` : `/intern/proposals/${encodeURIComponent(proposal.id)}`) : null;
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";
  const canSend = !!text.trim() && !sending;

  return (
    <section aria-label="Conversation" className="flex h-full min-h-0 flex-col bg-white">
      <header className="flex min-h-16 items-center gap-2 border-b border-ink-200 px-2 py-2 sm:px-4 md:gap-3">
        <Link href={`/${base}/messages`} className={cn("grid size-11 shrink-0 place-items-center rounded-apple-sm text-ink-700 hover:bg-ink-100 md:hidden", focusRing)} aria-label="Back to conversations">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <Avatar masked={base === "employer"} initials={ident.initials} name={who} label={who} size="sm" />
        <div className="min-w-0 flex-1">
          <h1 ref={heading} tabIndex={-1} className="truncate text-base font-semibold leading-tight text-ink-900 outline-none">
            {who}
          </h1>
          <div className="flex min-h-4 items-center gap-2">
            {thread ? <PresenceDot online={thread.counterpartOnline} label={thread.counterpartPresence} /> : null}
            {offline ? (
              <span role="status" className="text-xs text-text-subtle">
                Reconnecting…
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {proposal && proposalHref ? (
        <Link
          href={proposalHref}
          className={cn("flex min-h-12 items-center gap-3 border-b border-ink-200 bg-ink-50 px-4 py-2 text-sm hover:bg-ink-100 focus-visible:-outline-offset-2", focusRing)}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-text-subtle">Proposal</span>
            <span className="block truncate font-medium text-ink-900">{proposal.title}</span>
          </span>
          <span className="shrink-0 text-right text-xs text-text-subtle">
            <span className="block font-medium text-ink-800">{proposalStatusLabel(proposal.status)}</span>
            {durationLabel(proposal.duration) ? <span className="block">{durationLabel(proposal.duration)}</span> : null}
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-500" aria-hidden />
          <span className="sr-only">View proposal</span>
        </Link>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          tabIndex={0}
          role="log"
          aria-label={`Messages with ${who}`}
          className="h-full space-y-5 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 sm:px-5"
        >
          {status === "loading" ? (
            <div aria-busy="true" className="space-y-3">
              <span className="sr-only" role="status">
                Loading messages
              </span>
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-10 w-3/5" />
            </div>
          ) : null}
          {status === "error" ? (
            <div role="alert" className="text-sm text-ink-700">
              <p className="font-medium text-ink-900">Messages did not load.</p>
              <p className="mt-1 text-text-subtle">Check your connection, then try again.</p>
              <button type="button" onClick={() => void load()} className={cn("mt-3 inline-flex min-h-11 items-center rounded-apple-sm border border-ink-300 px-4 font-medium text-ink-900 hover:bg-ink-50", focusRing)}>
                Try again
              </button>
            </div>
          ) : null}
          {status === "missing" ? <p className="text-sm text-text-subtle">This conversation was not found. It may have been closed.</p> : null}
          {status === "ready" && msgs.length === 0 ? <p className="py-8 text-center text-sm text-text-subtle">No messages yet. Write the first one below.</p> : null}
          {groups.map((g) => (
            <div key={g.key} className="space-y-3">
              <p className="text-center">
                <span className="nums text-xs font-medium text-text-subtle">{g.label}</span>
              </p>
              {senderRuns(g.items).map((run) => {
                const lastIdx = run.items.length - 1;
                return (
                  <div key={run.items[0].id} className={cn("flex min-w-0 flex-col gap-1", run.mine ? "items-end" : "items-start")}>
                    {run.items.map((m, i) => (
                      <Fragment key={m.id}>
                        {m.id === newFromId ? (
                          <p className="my-2 flex w-full items-center gap-3 text-xs font-medium text-brand-700">
                            <span aria-hidden className="h-px flex-1 bg-brand-700/30" />
                            New messages
                            <span aria-hidden className="h-px flex-1 bg-brand-700/30" />
                          </p>
                        ) : null}
                      <div className={cn("group flex min-w-0 max-w-[85%] flex-col sm:max-w-[75%]", run.mine ? "items-end" : "items-start")}>
                        <p
                          className={cn(
                            "max-w-full whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed [overflow-wrap:anywhere]",
                            run.mine ? cn("bg-brand-700 text-white", i === lastIdx && "rounded-br-md") : cn("bg-ink-100 text-ink-900", i === lastIdx && "rounded-bl-md"),
                            m.pending && "opacity-70",
                            m.failed && "bg-danger-soft text-danger ring-1 ring-danger",
                          )}
                        >
                          <span className="sr-only">{run.mine ? "You: " : `${who}: `}</span>
                          {m.body}
                        </p>
                        <p className={cn("nums mt-0.5 text-xs text-text-subtle", i !== lastIdx && !m.failed && "sr-only group-hover:not-sr-only group-focus-within:not-sr-only")}>
                          <time dateTime={m.createdAt}>{clock(m.createdAt)}</time>
                          {m.mine ? <> · {statusText(m)}</> : null}
                          {m.failed ? (
                            <>
                              {" · "}
                              <button type="button" onClick={() => void send(m.body, m.id)} className={cn("inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-2", focusRing)}>
                                Retry
                              </button>
                              {" · "}
                              <button type="button" onClick={() => setMsgs((cur) => removeMsg(cur, m.id))} className={cn("inline-flex min-h-11 items-center underline underline-offset-2", focusRing)}>
                                Discard
                              </button>
                            </>
                          ) : null}
                        </p>
                      </div>
                      </Fragment>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {!atBottom ? (
          <button type="button" onClick={jump} className={cn("absolute bottom-3 right-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 text-sm font-medium text-ink-900 hover:bg-ink-50", focusRing)}>
            <ArrowDown className="size-4" aria-hidden /> Latest
          </button>
        ) : null}
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>

      <form
        className="border-t border-ink-200 bg-white p-2 sm:p-3"
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
            disabled={status === "missing"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            aria-describedby="msg-hint"
            placeholder="Write a message"
            className="max-h-36 min-h-11 flex-1 resize-none rounded-apple-sm border border-ink-300 bg-white px-3.5 py-[0.6875rem] text-base text-ink-900 placeholder:text-text-subtle focus-visible:border-brand-700 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand-700 disabled:bg-ink-50 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-apple-sm bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800 disabled:bg-ink-100 disabled:text-ink-500 sm:w-auto sm:px-5",
              focusRing,
            )}
          >
            <SendHorizontal className="size-4" aria-hidden />
            <span className="max-sm:hidden">{sending ? "Sending…" : "Send"}</span>
          </button>
        </div>
        <p id="msg-hint" className="nums mt-1.5 hidden text-xs text-text-subtle sm:block">
          Enter to send, Shift+Enter for a new line{text.length > MAX_BODY * 0.9 ? ` · ${text.length}/${MAX_BODY}` : ""}
        </p>
      </form>
    </section>
  );
}
