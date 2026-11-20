import { Lock } from "lucide-react";

import type { Currency } from "@/lib/format";
import type { SubscriptionCharge } from "@/lib/employer-subscription";
import { chargeLine } from "@/lib/subscription/view";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { RatingSlider } from "@/components/employer/candidate-filters";
import { CollegePicker } from "@/components/employer/candidates/college-picker";
import { SwitchField } from "@/components/employer/candidates/filter-parts";
import type { CollegeOption } from "@/lib/candidate-pro-filters";

/** Where an employer buys Findtern Pro (the page itself belongs to the subscription package). */
export const SUBSCRIPTION_HREF = "/employer/subscription";

/** "Pro" beside a control a subscriber has. Text, not colour alone. */
export function ProBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md bg-brand-50 px-1.5 text-[11px] font-semibold leading-none text-brand-800 ring-1 ring-inset ring-brand-200/70", className)}>
      Pro
    </span>
  );
}

/** "per year" for a 365-day purchase, "per month" for 30, else "for 90 days". */
export function periodLabel(days: number | null): string {
  if (days === 365) return "per year";
  if (days === 30) return "per month";
  return days ? `for ${days} days` : "";
}

/**
 * The CGPA and college filters for an employer WITHOUT Findtern Pro: the controls are on show but disabled, in
 * one card that says what they are, what they cost and where to unlock them. Disabled inputs leave the
 * form (nothing is sent), and the way out, the link, stays a normal tab stop. Locked is never a dead end.
 */
export function ProLockedCard({ offered, charge, periodDays, currency }: { offered: boolean; charge: SubscriptionCharge | null; periodDays: number | null; currency: Currency }) {
  const why = "pro-locked-why";
  return (
    <section aria-labelledby="pro-locked-title" className="mt-4 rounded-xl bg-brand-50/60 p-3.5 ring-1 ring-inset ring-brand-200/70">
      <h3 id="pro-locked-title" className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Lock className="size-4 shrink-0 text-brand-700" aria-hidden />
        Findtern Pro filters
      </h3>
      <p id={why} className="mt-1.5 text-xs leading-relaxed text-ink-700">
        {offered
          ? "Shortlist by minimum CGPA, verified CGPA only and college, and sort by college. These controls unlock with Findtern Pro."
          : "Filtering by CGPA and college is part of Findtern Pro, which is not on sale right now."}
      </p>

      {/* Disabled previews: they show what is behind the lock. They never submit and cannot be focused. */}
      <div className="mt-2 border-t border-brand-200/60 pt-2">
        <RatingSlider name="cgpaMin" label="Minimum CGPA" defaultValue={0} disabled describedBy={why} />
        <SwitchField name="cgpaVerified" value="1" defaultChecked={false} label="Verified CGPA only" disabled describedBy={why} />
        <div className="py-1.5">
          <label htmlFor="pro-locked-college" className="text-sm text-ink-700">
            College
          </label>
          <input
            id="pro-locked-college"
            type="text"
            disabled
            aria-disabled="true"
            aria-describedby={why}
            placeholder="Search colleges"
            className="mt-1 block h-11 w-full cursor-not-allowed rounded-xl border border-ink-200 bg-white/70 px-3 text-sm text-ink-900 opacity-60 placeholder:text-text-subtle"
          />
        </div>
      </div>

      {offered ? (
        <div className="mt-2.5">
          {charge ? (
            <p className="mb-2 text-sm text-ink-800">
              <span className="nums font-semibold text-ink-900">{chargeLine(charge, currency === "INR" ? "INR" : "USD")}</span> {periodLabel(periodDays)}
            </p>
          ) : null}
          <ButtonLink href={SUBSCRIPTION_HREF} variant="primary" size="md" block className="h-auto min-h-11 whitespace-normal rounded-xl px-3 py-2 text-center text-sm leading-snug">
            Unlock with Findtern Pro
          </ButtonLink>
        </div>
      ) : null}
    </section>
  );
}

function ProSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-4 border-t border-ink-100 pt-4">
      <h3 id={id} className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-900">
        {title}
        <ProBadge />
      </h3>
      {children}
    </section>
  );
}

/**
 * The same filters for a subscriber, live. The notes under them are the honest part: a percentage is converted
 * (and labelled approx.), and candidates with no score are named, not silently lost. `role="status"` so the
 * count change is announced after the list reloads.
 */
export function ProFilterSections({
  cgpaMin,
  cgpaVerified,
  colleges,
  options,
}: {
  cgpaMin: number;
  cgpaVerified: boolean;
  colleges: string[];
  options: CollegeOption[];
}) {
  return (
    <>
      <ProSection id="pro-cgpa-title" title="CGPA">
        <RatingSlider name="cgpaMin" label="Minimum CGPA" defaultValue={cgpaMin} />
        <SwitchField name="cgpaVerified" value="1" defaultChecked={cgpaVerified} label="Verified CGPA only" hint="A college has confirmed the score." />
        <p className="mt-1 text-xs leading-relaxed text-text-subtle">A percentage score is converted to CGPA (÷ 9.5) and marked approx.</p>
      </ProSection>
      <ProSection id="pro-college-title" title="College">
        <CollegePicker options={options} selected={colleges} />
      </ProSection>
    </>
  );
}
