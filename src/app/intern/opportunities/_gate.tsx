import { ArrowRight, Check } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import type { loadInternData } from "@/lib/intern-data";
import { profileCompletion } from "@/lib/onboarding";
import { isInternPaid } from "@/lib/payments";

type InternData = Awaited<ReturnType<typeof loadInternData>>;

/**
 * Open roles unlock on the same rule the dashboard uses: the activation fee
 * paid, which itself needs a complete profile (someone already working is past both). The
 * list and each role page check it, so a bookmarked URL is gated too.
 */
export async function rolesGate(uid: string, data: InternData) {
  const completion = profileCompletion(data.onboarding, {
    hasPanImage: Boolean(data.document?.panImageName),
    hasAadhaarImage: Boolean(data.document?.aadhaarImageName),
    hasPhoto: Boolean(data.document?.profilePhotoName),
  });
  const activated = await isInternPaid(uid);
  // Payment already required a complete profile, so a paid intern stays
  // unlocked when later rules (Aadhaar image, bank details) add fields.
  const unlocked = data.stage === "working" || activated;
  return { unlocked, complete: completion.complete, activated, done: completion.done, total: completion.total };
}

/** What a candidate sees instead of roles until both steps are done. */
export function LockedRoles({ complete, activated, done, total }: { complete: boolean; activated: boolean; done: number; total: number }) {
  const steps = [
    {
      label: "Complete your profile",
      detail: complete ? "Done." : `${done} of ${total} done. Employers search what is filled in here.`,
      done: complete,
      href: "/intern/onboarding",
      cta: "Finish your profile",
    },
    {
      label: "Activate your profile",
      detail: activated ? "Done." : "The one-time activation fee, paid from your dashboard once the profile is complete.",
      done: activated,
      href: "/intern/dashboard",
      cta: "Go to activation",
    },
  ];
  const next = steps.find((s) => !s.done) ?? steps[0];
  return (
    <Surface className="max-w-2xl p-6 sm:p-8">
      <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink-900">Two steps before you see open roles</h2>
      <p className="mt-1.5 max-w-prose text-pretty text-[0.9375rem] leading-relaxed text-ink-600">
        Companies only see profiles that are complete and active, so roles open up for you once both are done.
      </p>
      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-3">
            <span
              className={`nums mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                s.done ? "bg-brand-600 text-white" : s === next ? "bg-accent-400 text-brand-950" : "border border-ink-200 text-text-subtle"
              }`}
            >
              {s.done ? <Check className="size-4" strokeWidth={3} aria-label="Done" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-ink-900">{s.label}</span>
              <span className="mt-0.5 block text-sm text-ink-600">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <ButtonLink href={next.href} className="mt-7">
        {next.cta}
        <ArrowRight className="size-4" aria-hidden />
      </ButtonLink>
    </Surface>
  );
}
