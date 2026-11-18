"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2, Phone, Plus, Video } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { CALL_STATUS, DELAYS, SKILLS_SHOWN, YEAR_LABEL, clock, type DriveCandidate } from "@/components/employer/drive/shared";
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
    <li className="grid gap-x-6 gap-y-3 border-b border-ink-200 py-5 sm:grid-cols-[minmax(0,1fr)_5.5rem] lg:grid-cols-[minmax(0,1fr)_5.5rem_14.5rem] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-baseline gap-x-3">
          <span className="min-w-0 break-words font-display text-lg font-semibold text-ink-900">{c.name}</span>
          {c.online ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-800">
              <span className="size-1.5 rounded-full bg-brand-600" aria-hidden />
              Online
            </span>
          ) : null}
        </div>
        <p className="break-words text-sm text-ink-700">{meta || "Year and branch not given"}</p>
        {c.skills.length ? (
          <p className="mt-1 break-words text-sm text-ink-600">
            <span className="sr-only">Skills: </span>
            {c.skills.slice(0, SKILLS_SHOWN).join(", ")}
            {c.skills.length > SKILLS_SHOWN ? ` +${c.skills.length - SKILLS_SHOWN} more` : ""}
          </p>
        ) : null}
      </div>

      <div className="max-sm:flex max-sm:items-baseline max-sm:gap-3">
        <p className="text-xs text-ink-600 sm:order-2">{fullTime ? "Score · CGPA" : "Findtern Score"}</p>
        {c.score !== null ? (
          <p className="nums font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-ink-900 sm:order-1 sm:mb-1">
            {c.score.toFixed(1)}
            <span className="ml-1 font-sans text-sm font-medium tracking-normal text-ink-600">/10</span>
          </p>
        ) : (
          <p className="text-sm text-ink-700 sm:order-1">Interview not taken yet</p>
        )}
        {fullTime ? <p className="nums mt-1 text-sm text-ink-700 sm:order-3">CGPA {c.cgpa !== null ? c.cgpa.toFixed(1) : "not given"}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1 lg:flex-nowrap lg:justify-end">
        {call ? (
          <span className="mr-auto flex min-w-0 items-center gap-2 text-sm text-ink-700 lg:mr-0 lg:w-full lg:justify-end">
            <Pill tone={CALL_STATUS[call.status]?.tone ?? "neutral"}>{CALL_STATUS[call.status]?.label ?? "Call"}</Pill>
            <span className="nums truncate">{clock(call.startsAt)}</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={onShortlist}
          aria-pressed={shortlisted}
          aria-label={`Shortlist ${c.name}`}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
            shortlisted ? "border-brand-700 bg-brand-100 text-brand-900" : "border-ink-300 text-ink-800 hover:bg-ink-200/50",
          )}
        >
          {shortlisted ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          Shortlist
        </button>
        {open && call?.status === "accepted" && call.meetingLink ? (
          <a
            href={call.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            // Arrives by poll when the candidate accepts; fade in so it is noticed, not teleported.
            className={cn(buttonVariants({ size: "sm" }), "min-h-11 starting:scale-[0.97] starting:opacity-0")}
          >
            <Video className="size-4" aria-hidden />
            Join call
          </a>
        ) : open ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={busy} className={buttonVariants({ size: "sm", variant: "outline", className: "min-h-11" })}>
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

