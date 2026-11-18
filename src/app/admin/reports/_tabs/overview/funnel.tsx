import { Section } from "@/components/app/stat";
import { BarFunnel } from "@/components/admin/money/rp-bars";
import { LoadNote, windowWords } from "@/components/admin/money/rp-parts";
import { hiringFunnel } from "@/lib/admin/funnel";
import { reportHref } from "@/lib/admin/reports/href";

import type { TabProps } from "../types";

/**
 * Where hiring drops off: the one hiring funnel (lib/admin/funnel), people at the furthest step they reached in the period.
 * The last step is a hire, which is the employer paying; the intern's own activation fee is a separate payment, so the
 * caption says so next to the figure.
 */
export default async function Funnel({ window: w, params }: TabProps) {
  let steps: { label: string; count: number }[] | null = null;
  try {
    steps = (await hiringFunnel(w.since ?? null, w.until)).map((s) => ({ label: s.label, count: s.reached }));
  } catch (error) {
    console.error("[admin/reports/funnel] load failed", error);
  }
  const label = windowWords(w);
  return (
    <Section
      title="Where hiring drops off"
      hint={`Each person counted once, at the furthest step reached ${label}. Hired means the employer paid for the hire; the intern's own activation fee is a different payment, shown above.`}
    >
      {steps ? (
        <BarFunnel
          ariaLabel="Hiring funnel"
          unit="people"
          firstNoun="people"
          steps={steps.map((s, i) => (i === steps!.length - 1 ? { ...s, hint: "Employer paid" } : s))}
          emptyText={`Nobody reached the first step ${label}. Pick a longer period above, or open Proposal pipeline to see what is in flight.`}
        />
      ) : (
        <LoadNote what="the hiring funnel" retryHref={reportHref(params, {})} />
      )}
    </Section>
  );
}
