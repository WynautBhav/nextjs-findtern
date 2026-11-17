import { CheckCircle2, Clock, Info, TriangleAlert } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { CGPA_DISCLAIMER, type CgpaVerification } from "@/lib/cgpa-verification";

import { ProfileCard } from "./card";

/**
 * Where the intern's CGPA check stands, in plain words. Private to the intern (the employer sees it through the
 * proposal, not here). Shown only to interns who chose a semester and entered a score; nothing for the rest.
 */
export function CgpaVerificationCard({ v }: { v: CgpaVerification }) {
  if (v.status === "not_required") return null;
  const unit = v.scoreType === "percentage" ? "%" : " / 10";
  const claimed = `${v.claimedScore}${unit}`;
  const state =
    v.status === "verified"
      ? { tone: "live" as const, label: "Verified", icon: <CheckCircle2 aria-hidden />, text: "Findtern checked your score against your marksheets. Employers see it as verified." }
      : v.status === "incorrect"
        ? {
            tone: "new" as const,
            label: "Corrected",
            icon: <TriangleAlert aria-hidden />,
            text: `Your marksheets show ${v.correctedScore ?? "a different score"}${unit}, not ${claimed}. Your profile now carries the corrected score.${v.note ? ` Note from Findtern: ${v.note}` : ""}`,
          }
        : { tone: "waiting" as const, label: "Pending", icon: <Clock aria-hidden />, text: CGPA_DISCLAIMER };
  return (
    <ProfileCard
      id="cgpa"
      title="CGPA verification"
      hint={v.semester ? `Semester ${v.semester} · ${claimed}` : claimed}
      edit={v.status === "pending" || v.status === "incorrect" ? { href: "/intern/onboarding", label: "semester and score" } : undefined}
    >
      <div className="flex flex-col gap-2">
        <p>
          <Pill tone={state.tone} icon={state.icon}>
            {state.label}
          </Pill>
        </p>
        <p className="flex max-w-prose items-start gap-2 text-sm text-ink-700">
          <Info className="mt-0.5 size-4 shrink-0 text-text-subtle" aria-hidden />
          <span>{state.text}</span>
        </p>
      </div>
    </ProfileCard>
  );
}
