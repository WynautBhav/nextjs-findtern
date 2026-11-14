"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Send, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { OPEN_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/utils";
import { newTabAttrs } from "@/components/ui/new-tab";
import { NewTabHint } from "@/components/ui/new-tab-link";
import { Mascot, MascotAvatar, MASCOT_STAGE_BG } from "./mascot";
import { busyState, replyState, SLEEPY_AFTER_MS, TYPING_AFTER_MS, type MascotState } from "./mascot-state";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "How does the AI interview work?",
  "What does it cost for employers?",
  "Help me use the platform",
];

const TEASER_KEY = "findtern:chat-teaser-seen";
/** Auth and onboarding forms (see the placement note in ChatWidget). */
const FORM_ROUTE =
  /^\/(?:login|signup|forgot-password|reset-password|verify-email|(?:intern|employer)\/onboarding)(?:\/|$)/;
/** The nudge goes away by itself; it used to sit over the page until dismissed (QA-102). */
const TEASER_MS = 12_000;

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi, I'm Findy. Ask me anything about Findtern, or tell me where you're stuck.",
};

/* ── Tiny safe markdown for bot replies ────────────────────────────────
 * DeepSeek answers in markdown (**bold**, lists, [links](…), bare /paths).
 * Rendered without a dependency and without dangerouslySetInnerHTML: only
 * <strong>, <em>, <code>, <a>, <ul>/<ol>/<li>, <p> are ever created, and
 * links are restricted to same-origin paths and https URLs. */

const INLINE_RE =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;

/** `internalNewTab`: inside the signed-in apps and forms, site paths open in a new tab so the page (and the chat) stays put. */
function renderInline(text: string, keyPrefix: string, internalNewTab = false): ReactNode[] {
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
            {...newTabAttrs(internalNewTab || href.startsWith("http"))}
            className="font-medium text-primary underline decoration-accent decoration-[1.5px] underline-offset-2 hover:decoration-primary"
          >
            {label}
            {internalNewTab || href.startsWith("http") ? <NewTabHint /> : null}
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
                  {...newTabAttrs(internalNewTab || t.startsWith("http"))}
                  className="font-medium text-primary underline decoration-accent decoration-[1.5px] underline-offset-2 hover:decoration-primary"
                >
                  {t}
                  {internalNewTab || t.startsWith("http") ? <NewTabHint /> : null}
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

function BotText({ content, internalNewTab }: { content: string; internalNewTab?: boolean }) {
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
            {renderInline(item, `${key}-${i}`, internalNewTab)}
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
        <p key={`p-${i}`}>{renderInline(line.trim(), `p-${i}`, internalNewTab)}</p>,
      );
    }
  });
  flush("list-end");

  return <div className="space-y-1.5">{blocks}</div>;
}

/**
 * Findy - Findtern's always-visible chatbot.
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
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [teaser, setTeaser] = useState(false);
  // A field outside the chat has focus (the phone keyboard is up): the
  // launcher steps aside so it never covers what is being typed (QA-136).
  const [typing, setTyping] = useState(false);
  const reduceMotion = useReducedMotion();
  // What the owl is doing: waves when the panel opens, thinks (or searches) while a reply is pending.
  const [mood, setMood] = useState<MascotState>("idle");
  const celebrated = useRef(false);
  // The launcher owl waves goodbye (once) after a panel that saw a conversation is closed; closing is never delayed.
  const [launcherMood, setLauncherMood] = useState<MascotState>("idle");
  // Bumped on any interaction inside the panel; restarts the sleepy countdown.
  const [activity, setActivity] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setMood(open ? "greeting" : "idle");
    setLauncherMood(!open && messages.length > 1 ? "bye" : "idle");
  }

  // A one-time "Questions? Ask me" nudge a few seconds after load. Dismissed
  // (or the chat opened) once per browser session; storage can throw in a
  // private window, in which case it simply shows again next load.
  useEffect(() => {
    if (pathname?.startsWith("/admin")) return;
    // Not inside the signed-in consoles: the nudge is for visitors, and in a
    // console it landed over confirmations such as "Meeting request sent"
    // (QA-128). Ask me is in the console's top bar or corner all the same.
    if (/^\/(intern|employer|college)(\/|$)/.test(pathname ?? "")) return;
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

  useEffect(() => {
    if (!teaser) return;
    const t = window.setTimeout(dismissTeaser, TEASER_MS);
    return () => window.clearTimeout(t);
  }, [teaser]);

  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      t.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]") &&
      !t.closest("[data-chat-root]");
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  // The signed-in consoles open the chat from their top bar on desktop.
  useEffect(() => {
    const openChat = () => {
      setTeaser(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, openChat);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openChat);
  }, []);

  // Still waiting after a few seconds: the owl switches to typing (the clip swap crossfades).
  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setMood("typing"), TYPING_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [busy]);

  // Open, resting and untouched for a while: the owl dozes (any interaction wakes it).
  useEffect(() => {
    if (!open || busy || mood !== "idle") return;
    const t = window.setTimeout(() => setMood("sleepy"), SLEEPY_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [open, busy, mood, activity]);

  function wake() {
    setActivity((n) => n + 1);
    setMood((m) => (m === "sleepy" ? "idle" : m));
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    // The launcher is hidden while the panel is open; hand focus back to it on close.
    else if (wasOpenRef.current) launcherRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

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
    setMood(busyState(content));
    let nextMood: MascotState = "idle";
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
      // Thumbs-up for a thanks; otherwise a short cheer on the first answer only.
      nextMood = replyState(content, !celebrated.current);
      celebrated.current = true;
    } catch {
      nextMood = "oops";
      setError("Couldn't reach Findy just now. Try again or write to communicate@findtern.in.");
    } finally {
      setBusy(false);
      setMood(nextMood);
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
  //
  // Sign-in, sign-up and onboarding are forms on a phone: a floating button
  // there sat over the password field and the "sign in" link (QA-102), and
  // they carry their own help links, so below lg it stays out of the way.
  // They are not console pages either, so the top-bar placement never applies.
  const isForm = FORM_ROUTE.test(pathname ?? "");
  const inApp = !isForm && /^\/(intern|employer|college)(\/|$)/.test(pathname ?? "");
  const hasBottomNav = !isForm && /^\/(intern|college)(\/|$)/.test(pathname ?? "");
  // The intern and employer consoles have "Ask me" in their top bar on every
  // width, so no launcher floats over their cards on a phone; the panel opens from there.
  const headerOnly = !isForm && /^\/(intern|employer)(\/|$)/.test(pathname ?? "");

  return (
    <div
      data-chat-root
      className={cn(
        "pointer-events-none fixed z-[80] flex flex-col items-end gap-3",
        isForm && "max-lg:hidden",
        typing && !open && "max-lg:hidden",
        hasBottomNav ? "bottom-20 right-4" : "bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]",
        inApp ? "lg:bottom-auto lg:right-6 lg:top-[4.5rem]" : "lg:bottom-6 lg:right-6",
      )}
    >
      {/* ── Panel ─────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-label="Chat with Findy"
        aria-hidden={!open}
        inert={!open}
        onPointerDownCapture={wake}
        onKeyDownCapture={wake}
        className={cn(
          "flex w-[min(92vw,380px)] max-h-[min(calc(100dvh-2.5rem),42rem)] flex-col overflow-hidden rounded-[20px] border border-ink-200/70 bg-white shadow-[0_16px_48px_-12px_rgb(4_29_23/0.28)] transition-all duration-[260ms] ease-out-expo",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0 hidden",
        )}
      >
        {/* One header: owl tile (the stage colour is baked into the MP4 fallback, so the tile keeps it), name + status, close. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-ink-100 py-2 pl-3 pr-3">
          <div
            aria-hidden
            className="size-28 shrink-0 overflow-hidden rounded-2xl [@media(max-height:700px)]:size-20"
            style={{ backgroundColor: MASCOT_STAGE_BG }}
          >
            <Mascot
              state={mood}
              active={open}
              onDone={() => setMood("idle")}
              className="size-full"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold leading-tight text-ink-900">Findy</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-600">
              <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />
              Online · replies instantly
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="inline-flex size-9 shrink-0 items-center justify-center self-start rounded-lg text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="size-[18px]" aria-hidden />
          </button>
        </div>

        {/* Messages - data-lenis-prevent keeps the page's smooth-scroll
            (Lenis hijacks wheel at window level) from stealing wheel/touch
            gestures over this nested scroller. */}
        <div
          ref={listRef}
          aria-live="polite"
          data-lenis-prevent
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain bg-white px-4 py-3"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "self-end rounded-br-md bg-primary text-white"
                  : "self-start rounded-bl-md bg-ink-100 text-ink-800",
              )}
            >
              {m.role === "assistant" ? (
                <BotText content={m.content} internalNewTab={inApp || isForm} />
              ) : (
                m.content
              )}
            </div>
          ))}
          {/* Quick prompts: only before the conversation starts. */}
          {messages.length === 1 && !busy ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="rounded-full bg-brand-100 px-3 py-1.5 text-left text-[13px] font-medium text-brand-800 transition-colors hover:bg-brand-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : null}
          {busy && (
            <div className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md bg-ink-100 px-3 py-3" aria-label="Findy is typing">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="size-1.5 rounded-full bg-ink-500 animate-pulse-dot"
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

        {/* Input */}
        <form
          className="flex shrink-0 items-center gap-2 border-t border-ink-100 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor="fintern-input" className="sr-only">
            Ask Findy anything
          </label>
          <input
            id="fintern-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about interviews, pricing…"
            maxLength={2000}
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-600 transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send message"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-brand-100 disabled:text-brand-700 disabled:hover:bg-brand-100"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      </div>

      {/* ── Teaser (once per session) ─────────────────────── */}
      {/* Never on a form: at lg the bubble sat over the signup's helper text. */}
      {teaser && !open && !isForm ? (
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
            {inApp ? "Stuck somewhere? Ask Findy" : "Questions about Findtern? Ask Findy"}
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
        ref={launcherRef}
        type="button"
        onClick={() => {
          if (teaser) dismissTeaser();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={open ? "Hide Findy chat" : "Ask Findy - chat with Findy"}
        className={cn(
          "relative pointer-events-auto group flex items-center justify-center rounded-full font-semibold text-white shadow-md transition-colors duration-[180ms] ease-out-expo motion-reduce:transition-none",
          "bg-brand-800 hover:bg-brand-900",
          // Labelled on every screen size (bug sheet 7, NC r30/r40: the
          // icon-only launcher was too small to notice).
          // The owl avatar (idle loop) sits in the pill; 48px tall, small enough not
          // to sit over a whole row of the page beneath it.
          "h-12 min-w-12 gap-2 py-1 pl-1 pr-4 text-sm",
          open && "hidden",
          inApp && "lg:hidden",
          headerOnly && "hidden",
        )}
      >
        <MascotAvatar className="size-10" state={launcherMood} onDone={() => setLauncherMood("idle")} />
        <span className="font-semibold">Ask Findy</span>
      </button>
    </div>
  );
}
