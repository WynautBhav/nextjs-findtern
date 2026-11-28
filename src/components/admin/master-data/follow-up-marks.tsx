"use client";

import { Check } from "lucide-react";

import { shortDay, type CallNo, type FollowUp } from "@/lib/admin/follow-ups";
import { cn } from "@/lib/utils";

/**
 * The three follow-up marks side by side: Nudge (automatic, from admin nudges), Call 1 and Call 2 (manual ticks). Each
 * mark says its state in words ("done 28 Nov", "not yet"), so it never rests on the tick or on colour.
 */
const CHIP = "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[0.8125rem]";

function Done({ at }: { at: string }) {
  return (
    <>
      <Check className="size-3.5" aria-hidden />
      <span className="sr-only">done</span>
      <span className="nums">{shortDay(at)}</span>
    </>
  );
}

export function FollowUpMarks({ f, canWrite, busy, onToggle, name }: { f: FollowUp; canWrite: boolean; busy: boolean; onToggle: (call: CallNo, done: boolean) => void; name: string }) {
  const call = (n: CallNo) => {
    const mark = n === 1 ? f.call1 : f.call2;
    const locked = n === 2 ? !f.call1 : !!f.call2;
    const why = n === 2 && !f.call1 ? "Mark Call 1 first" : n === 1 && f.call2 ? "Undo Call 2 first" : mark ? `Undo Call ${n}` : `Mark Call ${n} done`;
    const body = mark ? <Done at={mark.at} /> : <span className="text-text-subtle">not yet</span>;
    if (!canWrite) {
      return <span className={cn(CHIP, mark ? "bg-brand-50 text-brand-800" : "bg-[color:var(--admin-panel-2)]")}>Call {n} {body}</span>;
    }
    return (
      <button
        type="button"
        aria-pressed={!!mark}
        aria-label={`Call ${n} for ${name}: ${mark ? `done ${shortDay(mark.at)}` : "not yet"}. ${why}.`}
        title={why}
        disabled={busy || locked}
        onClick={() => onToggle(n, !mark)}
        className={cn(
          CHIP,
          "border transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
          mark ? "border-transparent bg-brand-50 font-medium text-brand-800 hover:bg-brand-100" : "border-ink-200 bg-transparent text-foreground hover:bg-[color:var(--admin-panel-2)]",
        )}
      >
        Call {n} {body}
      </button>
    );
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(CHIP, f.nudge ? "bg-brand-50 text-brand-800" : "bg-[color:var(--admin-panel-2)]")}
        title={!f.nudgeable ? "Nudges go to students and employers only" : "Set automatically when Findtern nudges them"}
      >
        Nudge {!f.nudgeable ? <span className="text-text-subtle"><span aria-hidden>–</span><span className="sr-only">not applicable</span></span> : f.nudge ? <Done at={f.nudge.at} /> : <span className="text-text-subtle">not yet</span>}
      </span>
      {call(1)}
      {call(2)}
    </span>
  );
}
