"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2, Phone, Plus, Video } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { ScoreBar } from "@/components/app/score-bar";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { CALL_STATUS, DELAYS, SKILLS_SHOWN, SKILL_CHIP, YEAR_LABEL, clock, type DriveCandidate } from "@/components/employer/drive/shared";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MeetingView } from "@/lib/college/meetings";
import { cn } from "@/lib/utils";

function isOpen(call: MeetingView | undefined): boolean {
  if (!call) return false;
  if (call.status === "requested") return true;
  // An accepted call is "open" until it has had its 20 minutes.
  return call.status === "accepted" && new Date(call.startsAt).getTime() + 20 * 60_000 > Date.now();
}

export function CandidateRow({
  c,
  fullTime,
  shortlisted,
  call,
  onShortlist,
  onCall,
}: {
  c: DriveCandidate;
  fullTime: boolean;
  shortlisted: boolean;
  call: MeetingView | undefined;
  onShortlist: () => void;
  onCall: (minutes: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const open = isOpen(call);
  const meta = [c.year ? YEAR_LABEL(c.year) : null, c.branch].filter(Boolean).join(" · ");

  return (
    <li className="rise flex flex-col rounded-[24px] border border-ink-200/70 bg-white p-5 shadow-tile">
      <div className="flex items-start gap-3">
        <CandidateAvatar initials={c.initials} className="size-11 rounded-xl text-sm" />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2">
            <span className="min-w-0 break-words font-semibold text-ink-900">{c.name}</span>
            {c.online ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-800">
                <span className="size-1.5 rounded-full bg-brand-600" aria-hidden />
                Online
              </span>
            ) : null}
          </p>
          <p className="break-words text-sm text-ink-600">{meta || "Year and branch not given"}</p>
        </div>
        <button
          type="button"
          onClick={onShortlist}
          aria-pressed={shortlisted}
          aria-label={`Shortlist ${c.name}`}
          className={cn(
            "apple-spring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
            shortlisted ? "border-brand-200 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
          )}
        >
          {shortlisted ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          Shortlist
        </button>
      </div>

      <div className={cn("mt-4 grid gap-4", fullTime ? "grid-cols-2" : "grid-cols-1")}>
        <div>
          <div className="flex items-baseline justify-between text-xs font-medium text-text-subtle">
            <span>Findtern Score</span>
            {c.score !== null ? <span className="nums text-sm font-semibold text-ink-900">{c.score.toFixed(1)}</span> : null}
          </div>
          {c.score !== null ? <ScoreBar value={c.score} /> : <p className="mt-1 text-sm text-text-subtle">AI interview not taken yet</p>}
        </div>
        {fullTime ? (
          <div>
            <p className="text-xs font-medium text-text-subtle">CGPA</p>
            <p className="nums mt-0.5 text-sm font-semibold text-ink-900">{c.cgpa !== null ? c.cgpa.toFixed(1) : "Not given"}</p>
          </div>
        ) : null}
      </div>

      {c.skills.length ? (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills">
          {c.skills.slice(0, SKILLS_SHOWN).map((s) => (
            <li key={s} className={SKILL_CHIP}>
              {s}
            </li>
          ))}
        </ul>
      ) : null}
      {c.skills.length > SKILLS_SHOWN ? (
        <details className="mt-1.5">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-brand-700">
            +{c.skills.length - SKILLS_SHOWN} more
          </summary>
          <ul className="flex flex-wrap gap-1.5" aria-label="More skills">
            {c.skills.slice(SKILLS_SHOWN).map((s) => (
              <li key={s} className={SKILL_CHIP}>
                {s}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        {call ? (
          <span className="flex min-w-0 items-center gap-2 text-sm text-ink-600">
            <Pill tone={CALL_STATUS[call.status]?.tone ?? "neutral"}>{CALL_STATUS[call.status]?.label ?? "Call"}</Pill>
            <span className="nums truncate">{clock(call.startsAt)}</span>
          </span>
        ) : (
          <span />
        )}
        {open && call?.status === "accepted" && call.meetingLink ? (
          <a
            href={call.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            // Arrives by poll when the candidate accepts; fade in so it is noticed, not teleported.
            className={cn(buttonVariants({ size: "sm" }), "starting:scale-[0.97] starting:opacity-0")}
          >
            <Video className="size-4" aria-hidden />
            Join call
          </a>
        ) : open ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={busy} className={buttonVariants({ size: "sm", variant: "outline" })}>
                {busy ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <Phone className="size-4" aria-hidden />}
                Call
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1.5">
              <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-ink-600">
                Video call with {c.name}
                {!c.online ? <span className="mt-0.5 block font-normal">Not online right now: they get a notification, and may not see it at once.</span> : null}
              </DropdownMenuLabel>
              {DELAYS.map((d) => (
                <DropdownMenuItem
                  key={d.minutes}
                  className="min-h-11 cursor-pointer"
                  onSelect={async () => {
                    setBusy(true);
                    await onCall(d.minutes);
                    setBusy(false);
                  }}
                >
                  {d.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

