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
    <section aria-labelledby="calls-title" className="overflow-hidden rounded-[24px] border border-ink-200/70 bg-white shadow-tile ">
      <div className="border-b border-ink-100 px-4 py-3.5">
        <h2 id="calls-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-ink-900">
          Your calls
        </h2>
        <p className="mt-0.5 text-xs text-ink-600">Updates every few seconds. A request lapses 10 minutes after its start time.</p>
        {/* Always mounted; announces only when the number of calls changes, not on every poll. */}
        <p role="status" className="sr-only">
          {meetings.length} {meetings.length === 1 ? "call" : "calls"}
        </p>
      </div>
      {meetings.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-600">
          No calls yet. Use <span className="font-medium text-ink-800">Call</span> on a student to ask for a quick video chat.
        </p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-ink-100 overflow-y-auto">
          {meetings.map((m) => {
            const s = CALL_STATUS[m.status] ?? { tone: "neutral" as Tone, label: "Call" };
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{nameOf.get(m.userId) ?? "Student"}</p>
                  <p className="nums text-xs text-ink-600">{clock(m.startsAt)}</p>
                </div>
                {m.status === "requested" || m.status === "accepted" ? (
                  <button
                    type="button"
                    onClick={() => onCancel(m.id)}
                    aria-label={`Cancel call with ${nameOf.get(m.userId) ?? "student"}`}
                    className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                  >
                    Cancel
                  </button>
                ) : null}
                {m.status === "accepted" && m.meetingLink ? (
                  <a
                    href={m.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
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
