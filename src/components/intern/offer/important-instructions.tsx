import { Ban, Briefcase, EyeOff, GraduationCap, MessageSquare, PhoneOff, Scale, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Surface } from "@/components/app/primitives";

/**
 * "Important Instructions" from the legacy intern proposal page
 * (FindTern client/src/pages/proposal-detail.tsx), word for word. Shown on
 * internship offers only; full-time offers carry their own acceptance terms.
 */

type Item = {
  icon: LucideIcon;
  title: string;
  lines: string[];
  consequences?: string[];
  email?: string;
  after?: string;
};

const ITEMS: Item[] = [
  {
    icon: Scale,
    title: "Do Not Accept Casually",
    lines: [
      "Do not accept an internship proposal unless you are fully committed to completing the entire internship duration.",
      "Proposal acceptance is considered a professional and contractual commitment.",
    ],
  },
  {
    icon: Briefcase,
    title: "Internship Completion & Professional Conduct",
    lines: [
      "Interns must follow all rules, policies, and workplace regulations set by the employer throughout the internship duration.",
      "Failure to maintain professional conduct or comply with company policies may lead to disciplinary action from both the employer and Findtern.",
    ],
  },
  {
    icon: Ban,
    title: "Do Not Withdraw Midway Without Valid Reason",
    lines: [
      "Interns must not discontinue, abandon, or remain inactive during the internship period without legitimate justification and prior approval.",
    ],
    consequences: [
      "Monetary penalty as per Findtern policies",
      "Account suspension or restriction",
      "Blacklisting from Findtern and possible restriction from opportunities with multiple partner companies",
    ],
  },
  {
    icon: PhoneOff,
    title: "Do Not Bypass Findtern Engagement",
    lines: [
      "Interns selected through Findtern must complete the internship through the platform.",
      "Direct employment discussions, payment arrangements, or continuation of work outside Findtern without platform acknowledgement is strictly prohibited.",
      "Violations may result in financial penalties and platform restrictions.",
    ],
  },
  {
    icon: MessageSquare,
    title: "Use Findtern for Communication",
    lines: [
      "Interns should only communicate through Findtern-approved channels during the internship duration.",
      "Avoid sharing private contact details unless officially permitted after hiring confirmation.",
    ],
  },
  {
    icon: GraduationCap,
    title: "PPO / Conversion Disclosure",
    lines: [
      "If you receive a Pre-Placement Offer (PPO) or full-time employment opportunity during or after the internship, you must immediately inform Findtern at:",
    ],
    email: "communicate@findtern.in",
    after: "Failure to disclose PPO conversion may result in financial penalties and account action.",
  },
  {
    icon: EyeOff,
    title: "Confidentiality of Employer Information",
    lines: [
      "Employer and company details may be disclosed to interns only after the employer completes the required confirmation or payment process.",
      "Interns must not misuse, share, or distribute company details or confidential information received through Findtern.",
    ],
  },
];

export function ImportantInstructions() {
  return (
    <Surface as="section" className="p-6" aria-labelledby="offer-instructions">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent-100 text-accent-700 ring-1 ring-inset ring-accent-300/70">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="offer-instructions" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
            Important Instructions
          </h2>
          <p className="mt-0.5 text-sm text-ink-600">Before Accepting a Proposal</p>
        </div>
      </div>

      <p className="mt-4 rounded-[10px] bg-ink-50 px-4 py-3 text-pretty text-sm leading-relaxed text-ink-700">
        By accepting an internship proposal through Findtern, you acknowledge and agree to the following restrictions and
        responsibilities:
      </p>

      <ul className="mt-4 space-y-3">
        {ITEMS.map(({ icon: Icon, title, lines, consequences, email, after }) => (
          <li key={title} className="flex items-start gap-3 rounded-[10px] border border-ink-200/80 p-4">
            <Icon className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
              {lines.map((line) => (
                <p key={line} className="text-pretty text-sm leading-relaxed text-ink-700">
                  {line}
                </p>
              ))}
              {consequences ? (
                <div className="rounded-[10px] bg-warning-soft px-3 py-2.5">
                  <p className="text-sm font-medium text-ink-800">Failure to comply may result in:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-700">
                    {consequences.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {email ? (
                <p className="rounded-[10px] bg-brand-50 px-3 py-2">
                  <a href={`mailto:${email}`} className="text-sm font-semibold text-brand-800 underline-offset-4 hover:underline">
                    {email}
                  </a>
                </p>
              ) : null}
              {after ? <p className="text-pretty text-sm leading-relaxed text-ink-700">{after}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
