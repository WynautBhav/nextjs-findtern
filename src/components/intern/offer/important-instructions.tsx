import { Ban, Briefcase, ChevronDown, EyeOff, GraduationCap, MessageSquare, PhoneOff, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LIGHT_TILE, SectionHead, Surface } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

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

/** Open in full while the offer waits on an answer; folded afterwards, not a wall above a running internship. */
export function ImportantInstructions({ folded = false }: { folded?: boolean }) {
  if (folded) {
    return (
      <details className={cn("group rounded-apple-xl border border-ink-200/80 bg-white", LIGHT_TILE)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 lg:px-6 [&::-webkit-details-marker]:hidden">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">The rules you agreed to</h2>
          <ChevronDown className="size-4 shrink-0 text-text-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="px-5 pb-5 lg:px-6">
          <Rules />
        </div>
      </details>
    );
  }
  return (
    <Surface as="section" className="p-5 lg:p-6" aria-label="Important Instructions">
      <SectionHead title="Important Instructions" hint="Before Accepting a Proposal" />
      <Rules />
    </Surface>
  );
}

function Rules() {
  return (
    <>
      <p className="rounded-apple-sm bg-ink-50 px-4 py-3 text-pretty text-sm leading-relaxed text-ink-700">
        By accepting an internship proposal through Findtern, you acknowledge and agree to the following restrictions and
        responsibilities:
      </p>

      <ul className="mt-2 divide-y divide-ink-200/80">
        {ITEMS.map(({ icon: Icon, title, lines, consequences, email, after }) => (
          <li key={title} className="flex items-start gap-3 py-4 last:pb-0">
            <Icon className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <div className="min-w-0 max-w-prose space-y-1.5">
              <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
              {lines.map((line) => (
                <p key={line} className="text-pretty text-sm leading-relaxed text-ink-700">
                  {line}
                </p>
              ))}
              {consequences ? (
                <div className="rounded-apple-sm bg-warning-soft px-3 py-2.5">
                  <p className="text-sm font-medium text-ink-800">Failure to comply may result in:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-700">
                    {consequences.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {email ? (
                <p>
                  <a
                    href={`mailto:${email}`}
                    className="text-sm font-semibold text-brand-800 underline underline-offset-4 hover:decoration-2 touch:inline-flex touch:min-h-11 touch:items-center"
                  >
                    {email}
                  </a>
                </p>
              ) : null}
              {after ? <p className="text-pretty text-sm leading-relaxed text-ink-700">{after}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
