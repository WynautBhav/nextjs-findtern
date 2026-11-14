"use client";

/**
 * The Thread.
 *
 * One continuous spine of what has actually happened, newest first. It replaces
 * six disconnected lists with a single answer to the question a candidate asks
 * most and gets answered least, which is simply what is going on.
 *
 * On the mechanic: the obvious design here is a streak, and this is not one.
 * A streak rewards opening the app on consecutive days and punishes the
 * student who had exams, a job, or a bad week. That mechanic has been
 * documented doing real damage, with users describing a broken streak as a
 * debt they had to repay. The Thread has no counter, nothing to lose and
 * nothing that decays. A gap in it is not a failure, it is just a gap, and the
 * worst case for coming back after a month away is that the newest item is a
 * month old.
 *
 * What it does instead is answer the two questions that actually drive the
 * return: is anything waiting on me, and did anything I did recently land.
 * Those are different questions, they need different answers, and both are
 * answered here by looking at the data rather than by asking for a click.
 *
 * Motion: nodes rise in once on entry with a small stagger, and a node that
 * needs you breathes very slightly. The breathing stops after one cycle, it
 * never loops, and it is the only motion on the page that is not feedback for
 * something the person just did. Under reduced motion it collapses to a static
 * ring on the same node, so the signal survives without the movement.
 */

import Link from "next/link";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";

import { currentMilestone } from "@/lib/milestone-pick";

import type { ThreadNode, ThreadTone } from "@/lib/journey";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/format";

/** How many nodes from the top get the entry animation. */
const ANIMATED_NODES = 4;

const MARK: Record<ThreadTone, { dot: string; ring: string; text: string; label: string }> = {
  action: {
    dot: "bg-accent-500",
    ring: "ring-accent-300/60",
    text: "text-ink-900",
    label: "Needs you",
  },
  waiting: {
    dot: "bg-brand-400",
    ring: "ring-brand-200",
    text: "text-ink-800",
    label: "With them",
  },
  done: {
    dot: "bg-brand-700",
    ring: "ring-brand-200",
    text: "text-ink-800",
    label: "Done",
  },
  info: {
    dot: "bg-ink-300",
    ring: "ring-ink-200",
    text: "text-ink-700",
    label: "Update",
  },
};

export function Thread({
  nodes,
  compact,
  className,
}: {
  nodes: ThreadNode[];
  compact?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const inView = useInView(listRef, { once: true, margin: "-10% 0px" });

  if (nodes.length === 0) return null;

  const shown = compact ? nodes.slice(0, 4) : nodes;

  return (
    <ol ref={listRef} className={cn("relative", className)}>
      {/* The spine draws itself once, top to bottom, so the list reads as a
          single continuous record rather than a stack of rows. It fades out at
          the bottom so it reads as continuing rather than as a list that
          happens to end. */}
      {/* Start states never depend on `reduce` (null on the server), or the
          server HTML and a reduced-motion client disagree (QA-002b). Under
          reduced motion the transition is instant, and `data-reveal` shows
          the end state before hydration (globals.css). */}
      <motion.span
        aria-hidden
        data-reveal
        initial={{ scaleY: 0 }}
        animate={reduce || inView ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: "top" }}
        className="absolute bottom-3 left-[0.4375rem] top-3 w-px bg-brand-100"
      />
      {shown.map((node, i) => {
        const mark = MARK[node.tone];
        // Only the first screenful rises in. Anything below is visible from the
        // start, so a long record still reads in print, in reader mode and in
        // any context where the observer never fires.
        const animated = i < ANIMATED_NODES;
        return (
          <motion.li
            key={node.id}
            data-reveal={animated ? "" : undefined}
            initial={animated ? { opacity: 0, y: 10 } : false}
            animate={!animated || reduce || inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{
              duration: reduce ? 0 : 0.34,
              delay: reduce ? 0 : Math.min(i, 6) * 0.045,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            <NodeMark tone={node.tone} dot={mark.dot} ring={mark.ring} label={mark.label} reduce={!!reduce} />

            <div className="min-w-0 flex-1">
              <h3 className={cn("text-pretty text-base font-medium leading-snug", mark.text)}>
                {node.href && !node.action ? (
                  // The whole row is the link: the title stretches over it, so
                  // there is no separate "Open" line under every item.
                  <Link
                    href={node.href}
                    className="rounded-apple-sm hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 after:absolute after:inset-0"
                  >
                    {node.title}
                  </Link>
                ) : (
                  node.title
                )}
              </h3>
              <p className="mt-1 text-pretty text-sm text-text-subtle">{node.detail}</p>
              <p className="nums mt-1 text-xs text-text-subtle">
                {shortDate(node.at, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                {node.with ? ` · with ${node.with}` : null}
              </p>

              {node.action && node.href ? (
                <Link
                  href={node.href}
                  className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}
                >
                  {node.action}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

function NodeMark({
  tone,
  dot,
  ring,
  label,
  reduce,
}: {
  tone: ThreadTone;
  dot: string;
  ring: string;
  label: string;
  /** Only decides whether the pulse runs; never what is rendered. */
  reduce: boolean;
}) {
  const isAction = tone === "action";

  return (
    <span className="relative mt-1 grid size-3.5 shrink-0 place-items-center">
      <span className={cn("absolute size-3.5 rounded-full ring-4", ring, dot)} aria-hidden />
      {/* Always in the markup, hidden by CSS under reduced motion: branching
          on useReducedMotion() here was React #418 (QA-002b). */}
      {isAction ? (
        <motion.span
          aria-hidden
          className="absolute size-3.5 rounded-full bg-accent-400/50 motion-reduce:hidden"
          initial={{ scale: 1, opacity: 0.55 }}
          animate={reduce ? undefined : { scale: 2.1, opacity: 0 }}
          transition={{ duration: 2.4, repeat: 1, ease: "easeOut" }}
        />
      ) : null}
      {tone === "done" ? (
        <Check className="absolute size-2 text-white" strokeWidth={3.5} aria-hidden />
      ) : null}
      {/* The label is for assistive tech only. The visual encoding is colour
          plus shape plus this text, so the state never depends on hue. */}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The status strip.
 *
 * A persistent line under the page head that always answers "is anything
 * waiting on me", on every screen. This is the single most requested thing in
 * every piece of candidate research we did, and it costs one line. When
 * nothing is pending it says so plainly instead of showing a zero, because a
 * zero reads as a score and an absence reads as an answer.
 */
export function StatusStrip({
  node,
  stage,
  className,
}: {
  node: ThreadNode | null;
  stage: "seeking" | "working";
  className?: string;
}) {
  if (node) {
    return (
      <div
        className={cn(
          // The dashboard's one focal point: the only amber button on the screen.
          "flex flex-wrap items-center gap-4 rounded-apple-xl border border-ink-200/80 bg-white p-5 lg:p-6",
          className,
        )}
      >
        <span className="size-2 shrink-0 rounded-full bg-accent-500" aria-hidden />
        <p className="min-w-0 flex-[1_1_16rem] text-pretty text-base font-medium text-ink-900">
          {node.title}
          <span className="mt-1 block text-sm font-normal text-text-subtle">{node.detail}</span>
        </p>
        {node.href ? (
          <Link
            href={node.href}
            className={buttonClass({ variant: "accent", className: "shrink-0 max-sm:w-full" })}
          >
            {node.action ?? "Open"}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-apple-xl border border-brand-200/60 bg-brand-50/60 px-5 py-4",
        className,
      )}
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-600">
        <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden />
      </span>
      <p className="text-pretty text-sm font-medium text-ink-700">
        {stage === "working" ? "Nothing is waiting on you right now." : "Nothing needs an answer right now."}
      </p>
    </div>
  );
}

const seenListeners = new Set<() => void>();
// Storage blocked (private mode, quota): a dismissal still holds for this page view.
const seenMemory = new Map<string, Set<string>>();

function parseSeen(raw: string): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readSeenRaw(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function subscribeSeen(onChange: () => void) {
  seenListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    seenListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Records which cards the person has already seen, so a card that arrives can
 * be marked once without ever asking the server what is new.
 *
 * Local storage, best effort, and it never blocks rendering. A candidate on a
 * locked down browser simply sees the first card again on the next visit,
 * which is a slightly louder first run rather than a broken one.
 *
 * The server cannot read storage, so on the server and while hydrating the set
 * is `null` ("not read yet"); on a client navigation storage is read on the very
 * first render, so a card is never mounted and then removed (or the reverse) a
 * moment after paint.
 */
export function useSeenIds(key: string): [Set<string> | null, (id: string) => void] {
  const snapshot = useSyncExternalStore(
    subscribeSeen,
    () => {
      const mem = seenMemory.get(key);
      return mem && mem.size > 0 ? `${readSeenRaw(key)}\u0000${[...mem].join("\u0000")}` : readSeenRaw(key);
    },
    () => null,
  );
  const seen = useMemo(() => {
    if (snapshot === null) return null;
    const [raw, ...mem] = snapshot.split("\u0000");
    return new Set([...parseSeen(raw), ...mem]);
  }, [snapshot]);

  const mark = useCallback(
    (id: string) => {
      const ids = new Set([...parseSeen(readSeenRaw(key)), ...(seenMemory.get(key) ?? [])]);
      if (ids.has(id)) return;
      ids.add(id);
      seenMemory.set(key, new Set([...(seenMemory.get(key) ?? []), id]));
      try {
        window.localStorage.setItem(key, JSON.stringify([...ids].slice(-80)));
      } catch {
        /* private mode, quota, or storage disabled. Not worth a message. */
      }
      seenListeners.forEach((l) => l());
    },
    [key],
  );

  return [seen, mark];
}

/**
 * One dated note: a stored fact, its date and one next step, shown until it is dismissed.
 *
 * Dismissal is remembered per browser (see `useSeenIds`), never asked of the server. The server cannot know it, so
 * it renders every due note (the first visible, the rest `hidden`) and a tiny inline script from the server
 * (`DatedNoteGuard`, placed right after) hides the dismissed ones before first paint; the note therefore takes its
 * space from the start and nothing below it is pushed down. Once the client has read storage only the first
 * not-yet-dismissed one is rendered: one note at a time, the next due one after a dismissal. The only motion is a
 * 200 ms ease-out fade for a note that appears after hydration (a client navigation, or the next one after a
 * dismissal), skipped under reduced motion.
 */
export function DatedNote({
  storageKey,
  label,
  notes,
  className,
}: {
  storageKey: string;
  label: string;
  /** In priority order. */
  notes: { id: string; fact: string; next: { label: string; href: string } }[];
  className?: string;
}) {
  const [seen, dismiss] = useSeenIds(storageKey);
  const reduce = useReducedMotion();
  const current = seen ? currentMilestone(notes, seen) : notes[0];
  // `seen === null` is the server and hydration: render them all, as the server did (the script has hidden the
  // dismissed ones). `reduce` is never read for that case, so server and client agree (QA-002b).
  const shown = seen === null ? notes : current ? [current] : [];
  return (
    <>
      {shown.map((note, i) => (
        <motion.section
          key={note.id}
          aria-label={label}
          data-note-for={label}
          data-note-id={note.id}
          initial={seen === null || reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
          className={cn(
            "flex flex-col gap-1 rounded-apple-sm border border-ink-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4",
            seen === null && i > 0 && "hidden",
            className,
          )}
        >
          <p className="min-w-0 text-pretty leading-relaxed text-ink-800">
            {note.fact}{" "}
            <Link
              href={note.next.href}
              className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              {note.next.label}
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={() => dismiss(note.id)}
            className="-mx-2 inline-flex min-h-11 shrink-0 items-center self-start rounded-apple-sm px-2 font-medium text-ink-700 underline-offset-4 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-brand-600 sm:mx-0 sm:self-auto"
          >
            Dismiss
          </button>
        </motion.section>
      ))}
    </>
  );
}
