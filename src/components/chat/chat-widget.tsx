"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Send, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { OPEN_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "How does the AI interview work?",
  "Help me use the platform",
  "What is the Findtern Score?",
  "What does it cost for employers?",
  "Is placement guaranteed?",
];

const TEASER_KEY = "findtern:chat-teaser-seen";

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi, I'm Findtern - Findtern's assistant. Ask me anything about Findtern, or tell me where you're stuck and I'll walk you through the platform step by step.",
};

/* ── Tiny safe markdown for bot replies ────────────────────────────────
 * DeepSeek answers in markdown (**bold**, lists, [links](…), bare /paths).
 * Rendered without a dependency and without dangerouslySetInnerHTML: only
 * <strong>, <em>, <code>, <a>, <ul>/<ol>/<li>, <p> are ever created, and
 * links are restricted to same-origin paths and https URLs. */

const INLINE_RE =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_RE);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    let m: RegExpMatchArray | null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      (m = part.match(/^\[([^\]\n]+)\]\(([^)\n]+)\)$/)) !== null
    ) {
      const [, label, href] = m;
      if (/^(\/(?!\/)|https:\/\/)/.test(href)) {
        return (
          <a
            key={key}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noreferrer" : undefined}
            className="font-medium text-primary underline decoration-accent decoration-[1.5px] underline-offset-2 hover:decoration-primary"
          >
            {label}
          </a>
        );
      }
      return <span key={key}>{label}</span>;
    }
    // Bare same-origin paths (/pricing) and https URLs become links.
    const chunks = part.split(/((?:^|\s)(?:\/[a-z][\w/-]*|https:\/\/[^\s)]+))/g);
    return (
      <span key={key}>
        {chunks.map((c, j) => {
          const t = c.startsWith(" ") || c.startsWith("\n") ? c.slice(1) : c;
          const lead = c.startsWith(" ") || c.startsWith("\n") ? c[0] : "";
          if (/^(\/[a-z][\w/-]*|https:\/\/[^\s)]+)$/.test(t)) {
            return (
              <span key={j}>
                {lead}
                <a
                  href={t}
                  target={t.startsWith("http") ? "_blank" : undefined}
                  rel={t.startsWith("http") ? "noreferrer" : undefined}
                  className="font-medium text-primary underline decoration-accent decoration-[1.5px] underline-offset-2 hover:decoration-primary"
                >
                  {t}
                </a>
              </span>
            );
          }
          return <span key={j}>{c}</span>;
        })}
      </span>
    );
  });
}

function BotText({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = (key: string) => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={key}
        className={
          list.ordered
            ? "list-decimal space-y-1 pl-5"
            : "list-none space-y-1 pl-0"
        }
      >
        {list.items.map((item, i) => (
          <li
            key={i}
            className={cn(!list!.ordered && "relative pl-4")}
          >
            {!list!.ordered && (
              <span
                aria-hidden
                className="absolute left-0.5 top-[0.62em] size-1.5 rounded-full bg-accent"
              />
            )}
            {renderInline(item, `${key}-${i}`)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = (bullet?.[1] ?? numbered?.[1] ?? "").trim();
      if (!list || list.ordered !== ordered) {
        flush(`list-${i}`);
        list = { ordered, items: [] };
      }
      list.items.push(item);
    } else if (!line.trim()) {
      flush(`list-${i}`);
    } else {
      flush(`list-${i}`);
      blocks.push(
        <p key={`p-${i}`}>{renderInline(line.trim(), `p-${i}`)}</p>,
      );
    }
  });
  flush("list-end");

  return <div className="space-y-1.5">{blocks}</div>;
}

/**
 * Findtern - always-visible chatbot.
 *
 * Fixed bottom-right launcher + panel, rendered from the root layout so it
 * survives every navigation. Brand green header, theme tokens only, keyboard
 * accessible (Escape closes, focus moves to input on open), respects
 * reduced-motion via the global switch.
 */
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [teaser, setTeaser] = useState(false);
  const reduceMotion = useReducedMotion();

  // A one-time "Questions? Ask me" nudge a few seconds after load. Dismissed
  // (or the chat opened) once per browser session; storage can throw in a
  // private window, in which case it simply shows again next load.
  useEffect(() => {
    if (pathname?.startsWith("/admin")) return;
    try {
      if (window.sessionStorage.getItem(TEASER_KEY)) return;
    } catch {
      // ignore
    }
    const t = window.setTimeout(() => setTeaser(true), 2500);
    return () => window.clearTimeout(t);
    // Once per mount; the widget lives in the root layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismissTeaser() {
    setTeaser(false);
    try {
      window.sessionStorage.setItem(TEASER_KEY, "1");
    } catch {
      // ignore
    }
  }

  // The signed-in consoles open the chat from their top bar on desktop.
  useEffect(() => {
    const openChat = () => {
      setTeaser(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, openChat);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openChat);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-8) }),
      });
      const json = (await res.json().catch(() => null)) as {
        reply?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.reply) {
        throw new Error(json?.error ?? "Chat failed");
      }
      setMessages([...next, { role: "assistant", content: json.reply }]);
    } catch {
      setError("Couldn't reach Findtern just now. Try again or write to communicate@findtern.in.");
    } finally {
      setBusy(false);
    }
  }

  // Do not render marketing/support Findtern chat in the admin workspace
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  // The intern and college consoles have a phone tab bar (min-h-16), so the
  // launcher sits above it; it used to cover the college Roster tab. Inside
  // the signed-in consoles on desktop the launcher is the top bar's "Ask me"
  // button instead, so nothing floats over tables and rails; the prompt and
  // the panel drop from there. "/intern-nda" and
  // "/intern-terms-and-conditions" are public pages, so match the app
  // segments exactly rather than by prefix.
  const inApp = /^\/(intern|employer|college)(\/|$)/.test(pathname ?? "");
  const hasBottomNav = /^\/(intern|college)(\/|$)/.test(pathname ?? "");

  return (
    <div
      data-chat-root
      className={cn(
        "pointer-events-none fixed z-[80] flex flex-col items-end gap-3",
        hasBottomNav ? "bottom-20 right-4" : "bottom-5 right-4",
        inApp ? "lg:bottom-auto lg:right-6 lg:top-[4.5rem]" : "lg:bottom-6 lg:right-6",
      )}
    >
      {/* ── Panel ─────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-label="Chat with Findtern"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "flex w-[min(92vw,380px)] max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl transition-all duration-[260ms] ease-out-expo",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0 hidden",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 bg-brand-950 px-4 py-3.5 text-white">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-900 text-lg font-bold shadow-sm">
            F
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Findtern</p>
            <p className="flex items-center gap-1.5 text-xs text-on-dark-subtle">
              <span className="size-1.5 rounded-full bg-brand-300" aria-hidden />
              Online · replies instantly
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="inline-flex size-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Messages - data-lenis-prevent keeps the page's smooth-scroll
            (Lenis hijacks wheel at window level) from stealing wheel/touch
            gestures over this nested scroller. */}
        <div
          ref={listRef}
          aria-live="polite"
          data-lenis-prevent
          className="flex max-h-[46vh] min-h-[280px] flex-col gap-2.5 overflow-y-auto overscroll-contain bg-ink-50 px-3.5 py-4"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "self-end bg-primary text-white"
                  : "self-start border border-ink-200 bg-white text-ink-800 shadow-xs",
              )}
            >
              {m.role === "assistant" ? (
                <BotText content={m.content} />
              ) : (
                m.content
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-1.5 self-start rounded-xl border border-ink-200 bg-white px-3 py-2.5 shadow-xs" aria-label="Findtern is typing">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="size-1.5 rounded-full bg-ink-400 animate-pulse-dot"
                  style={{ animationDelay: `${d * 0.3}s` }}
                  aria-hidden
                />
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="self-start rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        {/* Quick prompts */}
        <div className="flex flex-wrap gap-1.5 border-t border-ink-100 bg-white px-3.5 pt-2.5">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void send(q)}
              disabled={busy}
              className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          className="flex items-center gap-2 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor="fintern-input" className="sr-only">
            Ask Findtern anything
          </label>
          <input
            id="fintern-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about interviews, pricing…"
            maxLength={2000}
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3 text-sm text-ink-900 placeholder:text-text-subtle focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send message"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition-all hover:bg-primary-hover disabled:opacity-40"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      </div>

      {/* ── Teaser (once per session) ─────────────────────── */}
      {teaser && !open ? (
        <motion.div
          role="status"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto relative flex max-w-[min(18rem,80vw)] items-center gap-1 rounded-2xl border border-ink-200 bg-white py-2 pl-4 pr-1.5 text-[0.9375rem] font-medium text-ink-800 shadow-lg"
        >
          <button
            type="button"
            onClick={() => {
              dismissTeaser();
              setOpen(true);
            }}
            className="rounded-lg py-1 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {inApp ? "Stuck somewhere? Ask me" : "Questions about Findtern? Ask me"}
          </button>
          <button
            type="button"
            onClick={dismissTeaser}
            aria-label="Dismiss"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            <X className="size-3.5" aria-hidden />
          </button>
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-1.5 right-8 size-3 rotate-45 border-r border-b border-ink-200 bg-white",
              // Under the top bar's button, the arrow points up at it.
              inApp && "lg:-top-1.5 lg:bottom-auto lg:rotate-[225deg]",
            )}
          />
        </motion.div>
      ) : null}

      {/* ── Launcher (always visible) ─────────────────────── */}
      <button
        type="button"
        onClick={() => {
          if (teaser) dismissTeaser();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={open ? "Hide Findtern chat" : "Ask me - chat with Findtern"}
        className={cn(
          "relative pointer-events-auto group flex items-center justify-center rounded-full font-semibold text-white shadow-md transition-colors duration-[180ms] ease-out-expo motion-reduce:transition-none",
          "bg-brand-800 hover:bg-brand-900",
          // Labelled on every screen size (bug sheet 7, NC r30/r40: the
          // icon-only launcher was too small to notice).
          open ? "size-14" : "h-14 min-w-14 gap-2 pl-4 pr-5 text-[0.9375rem]",
          inApp && "lg:hidden",
        )}
      >
        {open ? (
          <X className="size-5 shrink-0" aria-hidden />
        ) : (
          <div className="relative flex shrink-0 items-center justify-center">
            <MessageCircle className="size-6 shrink-0" aria-hidden />
          </div>
        )}
        <span className={cn(open ? "hidden" : "font-semibold")}>Ask me</span>
      </button>
    </div>
  );
}
