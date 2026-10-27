import { Ban, EyeOff, PhoneOff, Video } from "lucide-react";

import { SectionHead, Surface } from "@/components/app/primitives";
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

/**
 * The four rules plus the penalty line: a plain numbered list, not a grid of
 * icon cards. The words are the policy, so they carry it on their own.
 */
export function MeetingRulesList({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ol className="divide-y divide-ink-100 border-y border-ink-100">
        {MEETING_RULES.map(({ title, body }, i) => (
          <li key={title} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 py-3">
            <span className="nums pt-px text-sm font-semibold text-text-subtle">{i + 1}.</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">{title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm font-medium leading-relaxed text-ink-800">{MEETING_RULES_PENALTY}</p>
    </div>
  );
}

/** "Important instructions" on the employer proposal page (legacy parity, EMH-29). */
export function MeetingRulesBlock({ className }: { className?: string }) {
  return (
    <Surface as="section" className={cn("p-6", className)}>
      <SectionHead
        title="Rules for meetings through Findtern"
        hint="By joining any meeting scheduled through Findtern, you agree to this conduct policy."
      />
      <MeetingRulesList className="mt-4" />
    </Surface>
  );
}
