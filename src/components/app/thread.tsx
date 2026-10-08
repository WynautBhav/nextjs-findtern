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
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";

import type { ThreadNode, ThreadTone } from "@/lib/journey";
import { cn } from "@/lib/utils";

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
      <motion.span
        aria-hidden
        initial={reduce ? false : { scaleY: 0 }}
        animate={reduce || inView ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: "top" }}
        className="absolute bottom-3 left-[0.4375rem] top-3 w-px bg-gradient-to-b from-brand-200 via-brand-100 to-transparent"
      />
      {shown.map((node, i) => {
        const mark = MARK[node.tone];
        return (
          <motion.li
            key={node.id}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={reduce || inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{
              duration: 0.34,
              delay: reduce ? 0 : Math.min(i, 6) * 0.045,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            <NodeMark tone={node.tone} dot={mark.dot} ring={mark.ring} label={mark.label} reduce={!!reduce} />

            <div className="min-w-0 flex-1 pt-px">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h3 className={cn("text-[0.9375rem] font-semibold tracking-[-0.01em]", mark.text)}>
                  {node.title}
                </h3>
                <span className="text-xs text-ink-400">{node.at.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              </div>

              <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-600">{node.detail}</p>

              {node.with ? (
                <p className="mt-1.5 text-xs font-medium text-ink-500">with {node.with}</p>
              ) : null}

              {node.action && node.href ? (
                <Link
                  href={node.href}
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-[var(--dur-instant)] hover:bg-primary-hover hover:shadow-md active:scale-[0.98]"
                >
                  {node.action}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : node.href ? (
                <Link
                  href={node.href}
                  className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open
                  <ArrowRight className="size-3.5" aria-hidden />
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
  reduce: boolean;
}) {
  const isAction = tone === "action";

  return (
    <span className="relative mt-0.5 grid size-3.5 shrink-0 place-items-center">
      <span className={cn("absolute size-3.5 rounded-full ring-4", ring, dot)} aria-hidden />
      {isAction && !reduce ? (
        <motion.span
          aria-hidden
          className="absolute size-3.5 rounded-full bg-accent-400/50"
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 2.1, opacity: 0 }}
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
          "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-accent-300/50 bg-accent-100/50 px-4 py-3",
          className,
        )}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-500">
          <span className="size-1.5 rounded-full bg-white" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-pretty text-sm font-medium text-ink-900">
          {node.title}
          <span className="block text-sm font-normal text-ink-600">{node.detail}</span>
        </p>
        {node.href ? (
          <Link
            href={node.href}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white transition-[transform,opacity] duration-[var(--dur-instant)] hover:opacity-90 active:scale-[0.98]"
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
        "flex items-center gap-2.5 rounded-2xl border border-brand-200/60 bg-brand-50/60 px-4 py-3",
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

/**
 * Records which cards the person has already seen, so a card that arrives can
 * be marked once without ever asking the server what is new.
 *
 * Local storage, best effort, and it never blocks rendering. A candidate on a
 * locked down browser simply sees every card draw itself in, which is a
 * slightly louder first run rather than a broken one.
 */
export function useSeenIds(key: string): [Set<string> | null, (id: string) => void] {
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const ref = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      ref.current = new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      ref.current = new Set();
    }
    setSeen(new Set(ref.current));
  }, [key]);

  const mark = (id: string) => {
    if (ref.current.has(id)) return;
    ref.current.add(id);
    try {
      window.localStorage.setItem(key, JSON.stringify([...ref.current].slice(-80)));
    } catch {
      /* private mode, quota, or storage disabled. Not worth a message. */
    }
    setSeen(new Set(ref.current));
  };

  return [seen, mark];
}
