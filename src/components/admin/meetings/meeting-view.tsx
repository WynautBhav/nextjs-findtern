"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";

import { InterviewNotesButton, MeetingLinkCell } from "@/components/admin/proposal-tracker-dialogs";
import { StatusBadge } from "@/components/admin/status-badge";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { formatIst } from "@/lib/format";
import { feedbackOrReason, sourceLabel, statusText, TRACK_LABEL, zoneNote, type MeetingRow } from "@/lib/admin/meeting-stage";
import { cn } from "@/lib/utils";

import { Slots } from "./slots";
import { STAGE_TONE } from "./stage-tone";

const WHO: Record<string, string> = { employer: "The employer", intern: "The student", admin: "Findtern" };
const when = (v: string | null) => (v ? formatIst(v, { year: true }) : null);

/** One meeting in full, in a side sheet: every slot offered, who did what and when, the link and the feedback. */
export function MeetingView({ row, canEditLink }: { row: MeetingRow; canEditLink: boolean }) {
  const [open, setOpen] = useState(false);
  const isCall = row.kind === "call";
  const picked = row.startsAt;
  const detail = feedbackOrReason(row);
  // A meeting that is over (or never will be) keeps its link as it is; the server also refuses a link before a slot is picked.
  const finished = row.stage !== "sent" && row.stage !== "accepted";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass({ variant: "ghost", size: "sm", className: "rounded-full px-3 hover:bg-[color:var(--admin-panel-2)] max-lg:h-11" })}
        aria-label={`View meeting: ${row.candidate} with ${row.company}`}
      >
        View
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "left-auto right-0 top-0 flex h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-[30rem] sm:rounded-l-[1.75rem]",
            "data-[state=open]:slide-in-from-right-8 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 motion-reduce:animate-none",
          )}
        >
          <header className="bg-[#0a3a2c] px-6 pb-5 pt-6 text-[#f2faf6]">
            <div className="flex items-start justify-between gap-4">
              <DialogTitle className="text-balance text-xl font-medium leading-snug tracking-[-0.01em] text-[#f2faf6]">
                {row.candidate} with {row.company}
              </DialogTitle>
              <DialogClose className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-[#f2faf6] transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:size-11">
                <X className="size-4" aria-hidden />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
            <DialogDescription className="mt-1.5 text-sm text-[#a9cbbd]">
              {isCall ? "Campus drive call" : `Interview${row.round ? `, round ${row.round}` : ""}`}
              {row.project ? ` · ${row.project}` : ""}
            </DialogDescription>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge {...STAGE_TONE[row.stage]} label={statusText(row)} className="bg-white text-[#0a3a2c]" />
              <span className="inline-flex h-6 items-center rounded-full bg-white/10 px-2.5 text-xs font-medium">{TRACK_LABEL[row.track]}</span>
              <span className="inline-flex h-6 items-center rounded-full bg-white/10 px-2.5 text-xs font-medium">
                {sourceLabel(row)}
                {row.driveTitle ? ` · ${row.driveTitle}` : ""}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            <Section title="When">
              <Field label={isCall ? "Call time" : "Slots offered"}>
                <Slots row={row} className="-ml-2" showZone={false} />
              </Field>
              <Field label="Time zone">
                {isCall ? "IST. Drive calls are always set in India time." : (zoneNote(row)?.replace("Meeting time zone: ", "") ?? (row.timezone ? `${row.timezone} (IST)` : <Muted>Not set, so IST</Muted>))}
              </Field>
              {!isCall ? <Field label="Proposed by">{row.proposedBy ? (WHO[row.proposedBy] ?? row.proposedBy) : <Muted>Not recorded</Muted>}</Field> : null}
              {!isCall ? <Field label="Respond by">{when(row.respondBy) ?? <Muted>No deadline</Muted>}</Field> : null}
            </Section>

            <Section title="Meeting">
              <Field label="Meeting link">
                {isCall ? (
                  row.meetingLink ? (
                    <a href={row.meetingLink} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-brand-700 hover:underline">
                      Open link
                    </a>
                  ) : (
                    <Muted>No link</Muted>
                  )
                ) : (
                  <MeetingLinkCell interviewId={row.id} link={row.meetingLink} locked={!canEditLink || finished} awaitingSlot={!picked} />
                )}
              </Field>
              {!isCall ? <Field label="Employer joined">{when(row.employerJoinedAt) ?? <Muted>Not joined</Muted>}</Field> : null}
              {detail ? (
                <Field label={row.stage === "completed" ? "Employer feedback" : row.stage === "withdrawn" ? "Cancellation reason" : "Reason"}>
                  <span className="whitespace-pre-line">{detail}</span>
                </Field>
              ) : null}
              {row.notes?.trim() ? (
                <Field label="All notes">
                  <InterviewNotesButton title={`${row.candidate} · ${row.company}`} notes={row.notes} />
                </Field>
              ) : null}
            </Section>

            <Section title="Record">
              <Field label="Created">{when(row.createdAt) ?? <Muted>Unknown</Muted>}</Field>
              <Field label={isCall ? "Answered" : "Last change"}>{when(row.updatedAt) ?? <Muted>Not yet</Muted>}</Field>
              <Field label="Stored status">
                <span className="capitalize">{row.status || "none"}</span>
              </Field>
            </Section>

            <nav aria-label="Related records" className="mt-2 flex flex-wrap gap-2">
              <RelLink href={`/admin/interns/${row.internId}`}>Candidate</RelLink>
              <RelLink href={`/admin/companies/${row.employerId}`}>Company</RelLink>
              {row.proposalId ? <RelLink href={`/admin/proposal-tracker/${row.proposalId}`}>Proposal</RelLink> : null}
            </nav>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <dl className="divide-y divide-ink-100 rounded-2xl bg-[color:var(--admin-panel-2)] px-4">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2.5 text-sm max-sm:grid-cols-1 max-sm:gap-1">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-text-subtle">{children}</span>;

function RelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass({ variant: "outline", size: "sm", className: "rounded-full px-4" })}>
      {children}
    </Link>
  );
}
