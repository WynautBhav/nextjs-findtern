"use client";

import { useState } from "react";
import { Eye, Video } from "lucide-react";

import { InlineEditor } from "@/components/admin/inline-control";
import { ProposalOfferSummary } from "@/components/admin/proposal-offer-summary";
import { ProposalStatusEditor } from "@/components/admin/proposal-status-editor";
import { StatusBadge } from "@/components/admin/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";

/** "View" on a tracker row: the structured offer and the admin status override. */
export function ProposalDetailsButton({
  proposal,
}: {
  proposal: {
    id: string;
    status: string;
    currency: string | null;
    offerDetails: unknown;
    candidate: string;
    companyName: string;
    projectName: string;
    flow: string;
    sentAt: string;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "ghost", size: "sm", className: "max-lg:h-11" })}>
        <Eye className="size-4" aria-hidden />
        View
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink-900">
              {proposal.candidate} · {proposal.companyName}
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-600">
              {proposal.projectName} · {proposal.flow} · sent {proposal.sentAt}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-3 rounded-apple-md border border-ink-200/80 bg-ink-50 p-3">
            <StatusBadge value={proposal.status} />
            <ProposalStatusEditor proposalId={proposal.id} status={proposal.status} />
          </div>
          <ProposalOfferSummary proposalId={proposal.id} offerDetails={proposal.offerDetails} currency={proposal.currency} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Interview notes, read-only: feedback and recording links plus the employer's written feedback. */
export function InterviewNotesButton({ title, notes }: { title: string; notes: string }) {
  const [open, setOpen] = useState(false);
  const lines = notes.split("\n").filter((l) => l.trim());
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "ghost", size: "sm", className: "max-lg:h-11" })}>
        Notes
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink-900">Interview notes</DialogTitle>
            <DialogDescription className="text-sm text-ink-600">{title}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-ink-800">
            {lines.map((line, n) => {
              const m = /^(feedback_text|feedback|recording):\s*(.*)$/i.exec(line.trim());
              const label = m ? ({ feedback_text: "Employer feedback", feedback: "AI feedback", recording: "Recording" } as Record<string, string>)[m[1].toLowerCase()] : null;
              const value = m ? m[2] : line;
              return (
                <li key={n} className="rounded-apple-sm bg-ink-50 px-3 py-2">
                  {label ? <span className="block text-xs font-medium text-ink-600">{label}</span> : null}
                  {/^https?:\/\//.test(value) ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-brand-700 hover:underline">
                      {value}
                    </a>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{value}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The meeting link, edited in the row. Saving it marks an unfinished
 * interview "scheduled" (legacy rule, ADP-07) and tells both sides.
 */
export function MeetingLinkCell({ interviewId, link, locked }: { interviewId: string; link: string | null; locked: boolean }) {
  if (locked) {
    return link ? <LinkOut href={link} /> : <span className="text-sm text-ink-500">No link</span>;
  }
  return (
    <InlineEditor
      label="meeting link"
      value={{ meetingLink: link ?? "" }}
      display={
        link ? (
          <span className="inline-flex items-center gap-1 font-medium text-brand-700">
            <Video className="size-4" aria-hidden />
            Link set
          </span>
        ) : (
          <span className="text-ink-500">Add link</span>
        )
      }
      fields={[
        {
          key: "meetingLink",
          label: "Meeting link",
          type: "text",
          placeholder: "https://meet.google.com/…",
          hint: "Saving marks the interview scheduled and notifies both sides.",
        },
      ]}
      request={{ url: `/api/admin/interviews/${interviewId}/meeting-link`, method: "PUT" }}
    />
  );
}

function LinkOut({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
      <Video className="size-4" aria-hidden />
      Open link
    </a>
  );
}
