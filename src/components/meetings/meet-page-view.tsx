import { CalendarX2, Video } from "lucide-react";

import { MeetingGate } from "@/components/meetings/meeting-gate";
import { buttonClass } from "@/components/ui/button";
import { DISCLAIMER_VERSION } from "@/lib/meetings/gate-text";

export type MeetView =
  | { kind: "gate"; token: string; stamp: string; when: string | null; backHref: string }
  | { kind: "accepted"; token: string; when: string | null; backHref: string }
  | { kind: "invalid"; backHref: string }
  | { kind: "closed" | "pending"; when: string | null; backHref: string };

/** What /meet/<token> shows. Presentational: the page decides which view; no Meet URL ever passes through here. */
export function MeetPageView(view: MeetView & { note?: string | null }) {
  if (view.kind === "gate") {
    return (
      <>
        {view.when ? <p className="mx-auto mt-8 max-w-xl px-4 text-sm text-ink-600 sm:px-5">Your Findtern meeting: {view.when}</p> : null}
        <MeetingGate token={view.token} stamp={view.stamp} backHref={view.backHref} />
      </>
    );
  }
  const body =
    view.kind === "invalid"
      ? { title: "This meeting link is not valid", text: "It may have been mistyped, or it belongs to someone else. Open your dashboard to find your meetings." }
      : view.kind === "closed"
        ? { title: "This meeting can no longer be joined", text: "It was cancelled, has not been confirmed, or is over. Open your dashboard for the current state." }
        : view.kind === "pending"
          ? { title: "The meeting link is not ready yet", text: "Findtern will email you as soon as it is." }
          : { title: "You have agreed to the meeting rules", text: "You can join now. The rules are the same each time you open this meeting." };
  const Icon = view.kind === "accepted" ? Video : CalendarX2;
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-5 sm:py-16">
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-900">
        <Icon className="size-6 shrink-0 text-brand-700" aria-hidden />
        {body.title}
      </h1>
      {"when" in view && view.when ? <p className="mt-2 text-base text-ink-700">{view.when}</p> : null}
      <p role="status" className="mt-3 text-sm text-ink-600">
        {view.note ?? body.text}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {view.kind === "accepted" ? (
          <a href={`/api/meet/${encodeURIComponent(view.token)}/join`} data-disclaimer-version={DISCLAIMER_VERSION} className={buttonClass({ variant: "primary", size: "md", className: "min-h-11" })}>
            Join meeting
          </a>
        ) : null}
        <a href={view.backHref} className={buttonClass({ variant: view.kind === "accepted" ? "outline" : "primary", size: "md", className: "min-h-11" })}>
          Open dashboard
        </a>
      </div>
    </main>
  );
}
