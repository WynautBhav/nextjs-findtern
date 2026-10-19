"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AgreementSection = { title: string; lines: string[]; bullets?: string[] };

/**
 * A binding agreement that has to be read, ticked and then confirmed.
 *
 * Ports the legacy PolicyConfirmationDialog and the full-time acceptance
 * dialog: the confirm button stays locked for `seconds` after opening so the
 * terms are on screen long enough to be read, and the tick is required
 * on top. The countdown restarts every time the dialog opens.
 */
type AgreementProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  sections: AgreementSection[];
  agreeLabel: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  seconds?: number;
};

export function CountdownAgreement(props: AgreementProps) {
  const { open, onOpenChange, title, description, busy = false } = props;
  return (
    <Dialog open={open} onOpenChange={(next) => (!busy || next) && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-ink-100 px-6 pt-6 pb-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-[-0.015em] text-ink-900">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-pretty text-sm leading-relaxed text-ink-600">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {/* Content unmounts while closed, so the countdown and the tick
            start fresh on every open. */}
        <AgreementBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function AgreementBody({
  onOpenChange,
  sections,
  agreeLabel,
  confirmLabel,
  onConfirm,
  busy = false,
  seconds = 10,
}: AgreementProps) {
  const [left, setLeft] = useState(seconds);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) window.clearInterval(t);
    }, 250);
    return () => window.clearInterval(t);
  }, [seconds]);

  const ready = left === 0 && agreed && !busy;

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm text-ink-700">
        {sections.map((s) => (
          <section key={s.title} className="space-y-1.5">
            <h3 className="font-semibold text-ink-900">{s.title}</h3>
            {s.lines.map((line) => (
              <p key={line} className="text-pretty leading-relaxed">
                {line}
              </p>
            ))}
            {s.bullets?.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-ink-200 bg-ink-50 p-4">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-brand-700"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            <span className="block font-medium text-ink-900">{agreeLabel}</span>
            <span className="mt-1 block text-xs text-ink-500" aria-live="polite">
              {left > 0 ? `Please read for ${left}s before you can continue.` : "You can continue once you tick the box."}
            </span>
          </span>
        </label>
      </div>

      <DialogFooter className="border-t border-ink-100 px-6 py-4">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center rounded-[10px] border border-ink-200 bg-white px-5 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-55"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => void onConfirm()}
          className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-55"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {left > 0 ? `${confirmLabel} (${left}s)` : confirmLabel}
        </button>
      </DialogFooter>
    </>
  );
}

/** Legacy PolicyConfirmationDialog, verbatim in substance. */
export const EMPLOYER_HIRING_POLICY: AgreementSection[] = [
  {
    title: "Do not recruit outside the platform",
    lines: [
      "Employers must not directly hire, engage, or continue employment discussions with Findtern-listed interns outside the platform to avoid platform service or facilitation fees.",
      "Any hiring initiated through Findtern must be completed in compliance with platform policies.",
      "Violations may attract monetary penalties and employer account restrictions.",
    ],
  },
  {
    title: "Do not cancel a confirmed internship without a valid reason",
    lines: [
      "Employers must not terminate or withdraw confirmed internship offers without justified business or performance-related reasons.",
      "Non-compliance may lead to:",
    ],
    bullets: [
      "Monetary penalties",
      "Employer account suspension or candidate access restrictions",
      "Reduced employer credibility on the platform",
    ],
  },
  {
    title: "Mandatory PPO reporting",
    lines: [
      "Employers must notify Findtern before issuing any PPO or full-time employment offer to interns sourced through the platform.",
      "PPO-related communication must be shared at communicate@findtern.in.",
      "Failure to disclose PPO conversion may result in contractual and financial penalties.",
    ],
  },
  {
    title: "Professional internship environment",
    lines: [
      "Employers must ensure fair task allocation, ethical working conditions, and adherence to agreed internship scope.",
      "Employers must not assign illegal, exploitative, or role-irrelevant work.",
    ],
  },
  {
    title: "Data protection and confidentiality",
    lines: [
      "Employers must not misuse intern personal data, AI interview recordings, or candidate profile details outside recruitment or internship purposes.",
    ],
  },
];

/** Legacy full-time acceptance terms (proposal-detail.tsx:606-714). */
export const FULL_TIME_ACCEPTANCE_TERMS: AgreementSection[] = [
  {
    title: "Offer review confirmation",
    lines: [
      "By accepting, you confirm that you have thoroughly reviewed and understood all details of the employment offer, including job responsibilities, compensation, benefits, work expectations, notice periods, and other terms mentioned in the proposal.",
    ],
  },
  {
    title: "Binding employment commitment",
    lines: [
      "Acceptance of this full-time offer represents a formal professional commitment. Once accepted, the offer cannot be withdrawn, declined, or reversed without valid and documented justification.",
    ],
  },
  {
    title: "Failure to join after acceptance",
    lines: [
      "If you accept the full-time offer but fail to join the organization on the agreed joining date without legitimate justification, Findtern reserves the right to impose platform-level actions including penalties and restrictions.",
    ],
  },
  {
    title: "Mandatory platform compliance",
    lines: [
      "All employment processes facilitated through Findtern must be conducted transparently through the platform. Any attempt to bypass the platform after receiving an offer through Findtern will be considered a violation of platform policies.",
    ],
  },
  {
    title: "Undisclosed direct hiring restriction",
    lines: [
      "If you receive or accept a full-time offer through an organization connected via Findtern but fail to formally notify Findtern at communicate@findtern.in, it will be considered a breach of platform policy.",
      "Such violations may result in:",
    ],
    bullets: [
      "A monetary penalty equivalent to one month of your salary, and",
      "Permanent blacklisting from Findtern and its partner organizations.",
    ],
  },
  {
    title: "Platform blacklisting policy",
    lines: [
      "Any serious violation of these terms, including failure to join after accepting an offer or bypassing the platform, may result in permanent removal and blacklisting from the Findtern platform and its partner companies.",
    ],
  },
  {
    title: "Professional integrity requirement",
    lines: [
      "Findtern operates on professional trust and accountability. Candidates accepting employment offers are expected to maintain the highest level of professionalism and commitment.",
    ],
  },
];
