"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { useThreads } from "@/hooks/use-unread";
import { totalUnread } from "@/lib/messaging/ui-logic";
import { cn } from "@/lib/utils";
import { ThreadList } from "./thread-list";

/**
 * Two panes from md (list | conversation); one screen below it: the list, or the open conversation.
 * An open conversation on a phone is fixed between the console header and the tab bar, so the composer sits
 * right above the tab bar and, with the keyboard up, right above the keyboard (visualViewport).
 */
export function MessagesShell({
  base,
  activeId,
  children,
}: {
  base: "employer" | "intern";
  activeId?: string;
  children?: React.ReactNode;
}) {
  const { threads, loaded, error } = useThreads();
  const frame = useRef<HTMLDivElement>(null);
  const [keyboard, setKeyboard] = useState(0);

  // md and up: fill what is left of the viewport under the header so only the panes scroll.
  useLayoutEffect(() => {
    const el = frame.current;
    const main = el?.closest("main");
    if (!el || !main) return;
    const fit = () => {
      if (!window.matchMedia("(min-width: 768px)").matches) {
        el.style.height = "";
        el.style.marginBottom = "";
        return;
      }
      const pad = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      const lg = window.matchMedia("(min-width: 1024px)").matches;
      const reserve = lg ? 24 : 88; // 88: the tab bar (64) plus a gap
      el.style.height = `${Math.max(416, window.innerHeight - el.getBoundingClientRect().top - reserve)}px`;
      el.style.marginBottom = `${-(pad - reserve)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [activeId, loaded, threads.length]);

  // Phone: how much of the layout viewport the on-screen keyboard covers.
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !activeId) return;
    const sync = () => {
      const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setKeyboard(covered > 120 ? covered : 0);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [activeId]);

  // A failed load is not an empty inbox: the list shows the error and a retry.
  const empty = loaded && !error && threads.length === 0;
  const unread = totalUnread(threads);
  const next =
    base === "employer"
      ? { href: "/employer/candidates", label: "Browse candidates", body: "Send a proposal to a candidate and the conversation opens here, for both of you." }
      : { href: "/intern/profile", label: "Check your profile", body: "When a company sends you a proposal or an offer, you can talk to them here." };

  return (
    <>
      <PageHead title="Messages" className={cn("mb-4", activeId && "max-md:hidden")} />
      <div
        ref={frame}
        style={activeId && keyboard ? { bottom: keyboard } : undefined}
        className={cn(
          "overflow-hidden bg-white md:rounded-apple-xl md:border md:border-ink-200",
          // An open thread is its own screen on a phone.
          activeId
            ? "max-md:fixed max-md:inset-x-0 max-md:top-16 max-md:z-30 max-md:bottom-[calc(4rem+1px+env(safe-area-inset-bottom))]"
            : "max-md:rounded-apple-xl max-md:border max-md:border-ink-200",
          empty ? "grid place-items-center" : "md:grid md:grid-cols-[19rem_minmax(0,1fr)] lg:grid-cols-[21.5rem_minmax(0,1fr)]",
        )}
      >
        {empty ? (
          <EmptyScene
            compact
            art
            as="h2"
            title="No conversations yet"
            body={next.body}
            next={{ href: next.href, label: next.label }}
            className="w-full max-w-md py-16"
          />
        ) : (
          <>
            <section
              aria-label="Conversation list"
              className={cn("min-h-0 flex-col border-ink-200 md:h-full md:flex md:border-r", activeId ? "hidden" : "flex")}
            >
              <div className="flex min-h-12 items-center justify-between border-b border-ink-200 px-4">
                <h2 className="text-sm font-semibold text-ink-900">Conversations</h2>
                {unread > 0 ? <p className="nums text-xs font-medium text-brand-700">{unread} unread</p> : null}
              </div>
              <div className="min-h-0 overflow-y-auto overscroll-contain md:flex-1">
                <ThreadList base={base} activeId={activeId} />
              </div>
            </section>
            <div className={cn("h-full min-h-0 min-w-0", activeId ? "block" : "hidden md:grid md:place-items-center md:p-6")}>
              {activeId ? (
                children
              ) : (
                <div className="max-w-xs text-center">
                  <h2 className="text-sm font-semibold text-ink-900">Select a conversation</h2>
                  <p className="mt-1 text-sm text-text-subtle">Pick one from the list to read it and reply.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
