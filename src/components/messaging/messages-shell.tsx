"use client";

import { useLayoutEffect, useRef } from "react";

import {
  EmptyScene,
  PageHead,
  SURFACE_CLASS,
} from "@/components/app/primitives";
import { useThreads } from "@/hooks/use-unread";
import { cn } from "@/lib/utils";
import { ThreadList } from "./thread-list";

// Fills the viewport under the console header: the page itself never scrolls, the panes do.
const FRAME =
  "h-[calc(100dvh-11.5rem)] min-h-[26rem] lg:h-[calc(100dvh-10rem)]";

/** Two panes from lg (list 340px | conversation); one pane below, the list when no thread is open. */
export function MessagesShell({
  base,
  activeId,
  children,
}: {
  base: "employer" | "intern";
  activeId?: string;
  children?: React.ReactNode;
}) {
  const { threads, loaded } = useThreads();
  const frame = useRef<HTMLDivElement>(null);
  // Fill what is left of the viewport under the header and any banner above, so only the panes scroll.
  useLayoutEffect(() => {
    const el = frame.current;
    const main = el?.closest("main");
    if (!el || !main) return;
    const fit = () => {
      const pad = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      if (!wide && !activeId) {
        // Mobile list: size to content, no forced height.
        el.style.height = "";
        el.style.marginBottom = "";
        return;
      }
      const reserve = wide ? 24 : pad;
      el.style.height = `${Math.max(416, window.innerHeight - el.getBoundingClientRect().top - reserve)}px`;
      el.style.marginBottom = wide ? `${-(pad - reserve)}px` : "";
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
  const empty = loaded && threads.length === 0;
  const next =
    base === "employer"
      ? {
          href: "/employer/candidates",
          label: "Browse candidates",
          body: "Send a proposal to a candidate and the conversation opens here, for both of you.",
        }
      : {
          href: "/intern/opportunities",
          label: "See open roles",
          body: "When a company sends you a proposal or an offer, you can talk to them here.",
        };

  return (
    <>
      <PageHead title="Messages" className="mb-4" />
      <div
        ref={frame}
        className={cn(
          SURFACE_CLASS,
          "overflow-hidden",
          activeId ? FRAME : "lg:h-[calc(100dvh-10rem)] lg:min-h-[26rem]",
          empty
            ? "grid place-items-center"
            : "lg:grid lg:grid-cols-[340px_minmax(0,1fr)]",
        )}
      >
        {empty ? (
          <div className="w-full max-w-xl px-4">
            <EmptyScene
              as="h2"
              title="Conversations start from a proposal"
              body={next.body}
              next={{ label: next.label, href: next.href }}
              who={
                base === "employer"
                  ? "You - send the first proposal"
                  : undefined
              }
            />
          </div>
        ) : (
          <>
            <section
              aria-label="Conversation list"
              className={cn(
                "min-h-0 flex-col border-ink-100 lg:h-full lg:flex lg:border-r",
                activeId ? "hidden" : "flex",
              )}
            >
              <h2 className="flex min-h-12 items-center border-b border-ink-100 px-4 text-sm font-semibold text-ink-900">
                Conversations
              </h2>
              <div className="min-h-0 lg:flex-1 overflow-y-auto overscroll-contain">
                <ThreadList base={base} activeId={activeId} />
              </div>
            </section>
            <div
              className={cn(
                "h-full min-h-0 min-w-0",
                activeId
                  ? "block"
                  : "hidden lg:grid lg:place-items-center lg:p-6",
              )}
            >
              {activeId ? (
                children
              ) : (
                <EmptyScene
                  as="h2"
                  title="Pick up a conversation"
                  body="Open a thread on the left to read it and reply. New offers and interviews start one."
                  className="w-full max-w-md"
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
