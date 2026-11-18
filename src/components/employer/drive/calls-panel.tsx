"use client";

import { Video, X } from "lucide-react";

import { Pill, type Tone } from "@/components/app/primitives";
import { CALL_STATUS, clock } from "@/components/employer/drive/shared";
import type { MeetingView } from "@/lib/college/meetings";

export function CallsPanel({
  meetings,
  nameOf,
  onCancel,
  headingRef,
}: {
  meetings: MeetingView[];
  nameOf: Map<string, string>;
  onCancel: (id: string) => Promise<void>;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <section aria-labelledby="calls-title">
      <div className="border-b border-ink-300 pb-2">
        <h2 id="calls-title" ref={headingRef} tabIndex={-1} className="font-display text-lg font-semibold text-ink-900">
          Your calls
        </h2>
        <p className="mt-0.5 text-sm text-ink-700">Updates every few seconds. A request lapses 10 minutes after its start time.</p>
        {/* Always mounted; announces only when the number of calls changes, not on every poll. */}
        <p role="status" className="sr-only">
          {meetings.length} {meetings.length === 1 ? "call" : "calls"}
        </p>
      </div>
      {meetings.length === 0 ? (
        <p className="py-4 text-sm text-ink-700">
          <span className="font-medium text-ink-900">No calls yet.</span> A call is a quick video chat with a student. Press Call on a student in the list to ask for one.
        </p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-ink-200 overflow-y-auto">
          {meetings.map((m) => {
            const s = CALL_STATUS[m.status] ?? { tone: "neutral" as Tone, label: "Call" };
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{nameOf.get(m.userId) ?? "Student"}</p>
                  <p className="nums text-sm text-ink-700">{clock(m.startsAt)}</p>
                </div>
                {m.status === "requested" || m.status === "accepted" ? (
                  <button
                    type="button"
                    onClick={() => onCancel(m.id)}
                    aria-label={`Cancel call with ${nameOf.get(m.userId) ?? "student"}`}
                    className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-ink-700 hover:bg-ink-200/60 hover:text-ink-900"
                  >
                    Cancel
                  </button>
                ) : null}
                {m.status === "accepted" && m.meetingLink ? (
                  <a
                    href={m.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-brand-800 hover:bg-brand-100"
                  >
                    <Video className="size-4" aria-hidden />
                    Join
                  </a>
                ) : (
                  <Pill tone={s.tone}>
                    {m.status === "declined" ? <X className="size-3" aria-hidden /> : null}
                    {s.label}
                  </Pill>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
