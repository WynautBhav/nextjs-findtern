import { Ban, EyeOff, PhoneOff, Scale, ShieldAlert, Video } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

/**
 * The employer's meeting conduct policy, word for word from legacy
 * (employer-schedule.tsx:1569, employer-proposal-detail.tsx:1612). Shown as
 * a block on the proposal page (EMH-29) and in the dialog every "Join
 * meeting" opens (EMB-10). Server-safe: no client directive.
 */
export const MEETING_RULES = [
  {
    Icon: EyeOff,
    title: "Do not reveal company or personal identity",
    body: "Do not disclose company name, employee identity, direct contact info, office location, or organizational identifiers.",
  },
  {
    Icon: PhoneOff,
    title: "Do not request the intern's personal contact information",
    body: "Do not ask for phone, email, social handles or personal contact channels.",
  },
  {
    Icon: Ban,
    title: "Do not initiate off-platform hiring or negotiation",
    body: "Do not confirm hiring or negotiate outside Findtern.",
  },
  {
    Icon: Video,
    title: "Monitoring and recording consent",
    body: "Meetings are monitored and recorded for compliance, security, and dispute resolution.",
  },
] as const;

export const MEETING_RULES_PENALTY =
  "Violations may result in monetary penalties, suspension, reduced visibility, blacklisting, or legal action.";

/** The four rules plus the penalty line, as a compact grid. */
export function MeetingRulesList({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {MEETING_RULES.map(({ Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3 rounded-apple-lg border border-ink-200/80 bg-white p-3.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 rounded-apple-md bg-accent-100/70 px-3.5 py-3 text-sm leading-relaxed text-ink-800">
        <Scale className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
        {MEETING_RULES_PENALTY}
      </p>
    </div>
  );
}

/** "Important instructions" on the employer proposal page (legacy parity, EMH-29). */
export function MeetingRulesBlock({ className }: { className?: string }) {
  return (
    <section className={cn("rounded-apple-xl border border-brand-200/70 bg-brand-50/50 p-5 sm:p-6", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-apple-md bg-brand-700 text-white" aria-hidden>
          <ShieldAlert className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink-900">Mandatory rules while joining meetings</h2>
            <Pill tone="live">Applies to you</Pill>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            By joining any meeting scheduled through Findtern, you must comply with the following conduct policy.
          </p>
        </div>
      </div>
      <MeetingRulesList className="mt-4" />
    </section>
  );
}
