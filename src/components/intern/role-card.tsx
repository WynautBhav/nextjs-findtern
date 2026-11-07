import Link from "next/link";
import { ArrowRight, Check, Clock, MapPin, Briefcase, TrendingUp } from "lucide-react";

import { MetaList } from "@/components/app/meta-list";
import { Pill } from "@/components/app/primitives";
import { Lift } from "@/components/intern/kit/motion";
import { MatchRing } from "@/components/intern/kit/ring";
import { skillMatch } from "@/components/app/skill-match";
import { formatDayLabel } from "@/lib/format";
import { toArray } from "@/lib/journey";
import { cn } from "@/lib/utils";

/**
 * One open role for signed-in candidates, as a result card. The company is not
 * named (bug sheet 7): its name is shared once it hires. There is no apply
 * button by design; the only action is "View offer" when one exists.
 */
export type InternRole = {
  id: string;
  projectName: string;
  companyName: string;
  scopeOfWork?: string | null;
  skills?: unknown;
  locationType?: string | null;
  fullTimeOffer?: boolean | null;
  city?: string | null;
  state?: string | null;
  createdAt: Date | string | null;
};

export const MODE: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };

export function InternRoleCard({
  role,
  considered = false,
  offerHref,
  mine,
}: {
  role: InternRole;
  considered?: boolean;
  /** Where "View offer" goes, when the candidate has an offer for this role. */
  offerHref?: string;
  /** The candidate's own skills, lowercased. */
  mine?: Set<string>;
}) {
  const wanted = toArray<string>(role.skills);
  const mineList = [...(mine ?? [])];
  const { matched } = skillMatch(mineList, wanted);
  const has = (skill: string) => Boolean(mine?.has(skill.toLowerCase().trim()));
  const skills = [...wanted].sort((a, b) => Number(has(b)) - Number(has(a)));
  const place = [role.city, role.state].filter(Boolean).join(", ");
  const mode = role.locationType ? (MODE[role.locationType.toLowerCase()] ?? role.locationType) : null;
  const day = role.createdAt ? formatDayLabel(role.createdAt) : null;
  const posted = day && day !== "Unknown" ? `Posted ${/^\d/.test(day) ? day : day.toLowerCase()}` : null;

  const total = Math.min(wanted.length, 7);

  return (
    <Lift className="h-full">
      <article className="group relative flex h-full flex-col gap-4 rounded-apple-xl border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(4,29,23,0.05),0_12px_28px_-18px_rgba(4,29,23,0.2)] transition-shadow hover:shadow-[0_1px_2px_rgba(4,29,23,0.06),0_18px_36px_-16px_rgba(4,29,23,0.3)] lg:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {considered ? <Pill tone="live" icon={<Check />} className="mb-2">Offer received</Pill> : null}
            <h2 className="min-w-0 text-pretty text-lg font-semibold leading-snug tracking-[-0.01em] text-ink-900">
              <Link
                href={`/intern/opportunities/${role.id}`}
                className="rounded-apple-sm hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 after:absolute after:inset-0 after:rounded-apple-xl"
              >
                {role.projectName}
              </Link>
            </h2>
          </div>
          {wanted.length > 0 ? (
            <MatchRing have={matched.length} total={total} label={`You have ${matched.length} of ${total} skills`} />
          ) : null}
        </div>

        {role.scopeOfWork ? <p className="line-clamp-2 text-pretty text-sm text-ink-600">{role.scopeOfWork}</p> : null}

        <MetaList
          className="nums"
          items={[
            { icon: <Briefcase />, text: mode },
            { icon: <MapPin />, text: mode === "Remote" ? null : place },
            { icon: <Clock />, text: posted },
            role.fullTimeOffer
              ? { icon: <TrendingUp />, text: <span className="font-medium text-ink-700">Can lead to full time</span> }
              : {},
          ]}
        />

        {skills.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Skills wanted">
            {skills.slice(0, 6).map((skill) => (
              <li key={skill}>
                <Pill
                  tone={has(skill) ? "live" : "neutral"}
                  icon={has(skill) ? <Check /> : undefined}
                  className={cn(has(skill) ? "font-semibold" : "font-normal")}
                >
                  {skill}
                  {has(skill) ? <span className="sr-only"> (you have this)</span> : null}
                </Pill>
              </li>
            ))}
            {skills.length > 6 ? <li className="nums self-center text-xs text-text-subtle">+{skills.length - 6}</li> : null}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {wanted.length > 0 ? (
            <p className="text-sm text-text-subtle">
              You have <span className="nums font-semibold text-ink-800">{matched.length}</span> of <span className="nums">{total}</span> skills
            </p>
          ) : (
            <span />
          )}
          {considered && offerHref ? (
            <Link
              href={offerHref}
              className="relative z-10 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-apple-sm bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 max-sm:w-full"
            >
              View offer
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </article>
    </Lift>
  );
}
