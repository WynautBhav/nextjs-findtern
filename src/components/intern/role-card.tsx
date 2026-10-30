import Link from "next/link";

import { Pill } from "@/components/app/primitives";
import { formatDayLabel } from "@/lib/format";
import { toArray } from "@/lib/journey";

/**
 * One open role, for signed-in candidates, as a list row. The company is not
 * named or shown as initials (bug sheet 7, S1 r27/r67, S2 r5): its name is
 * shared once it hires, and every row wearing the same "ZT" mark said nothing.
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
  mine,
}: {
  role: InternRole;
  considered?: boolean;
  /** The candidate's own skills, lowercased: the ones a role shares are marked, and listed first. */
  mine?: Set<string>;
}) {
  const has = (skill: string) => Boolean(mine?.has(skill.toLowerCase().trim()));
  const skills = [...toArray<string>(role.skills)].sort((a, b) => Number(has(b)) - Number(has(a)));
  const place = [role.city, role.state].filter(Boolean).join(", ");
  const mode = role.locationType ? (MODE[role.locationType.toLowerCase()] ?? role.locationType) : null;
  const where = [mode, mode === "Remote" ? null : place].filter(Boolean).join(" · ");
  const day = role.createdAt ? formatDayLabel(role.createdAt) : null;
  const posted = day && day !== "Unknown" ? `Posted ${/^\d/.test(day) ? day : day.toLowerCase()}` : null;
  const meta = [where, posted].filter(Boolean).join(" · ");

  return (
    <div className="relative flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-ink-50/60 sm:flex-row sm:items-start sm:gap-4 lg:px-6">
      <div className="min-w-0 flex-1">
        <h2 className="text-pretty text-base font-medium text-ink-900">
          {/* The title stretches over the row, so the whole row is the link. */}
          <Link
            href={`/intern/opportunities/${role.id}`}
            className="rounded-apple-sm hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 after:absolute after:inset-0"
          >
            {role.projectName}
          </Link>
        </h2>
        {role.scopeOfWork ? (
          <p className="mt-1 line-clamp-2 text-pretty text-sm text-ink-600">{role.scopeOfWork}</p>
        ) : null}
        {meta ? <p className="nums mt-2 text-xs text-text-subtle">{meta}</p> : null}
        {skills.length > 0 ? (
          // Own line, so the skills a candidate shares are easy to scan and never wrap into the place and date.
          <p className="mt-1 text-xs text-ink-600">
            {skills.slice(0, 4).map((skill, i) => (
              <span key={skill}>
                {i > 0 ? ", " : null}
                {has(skill) ? <span className="font-medium text-brand-700">{skill}<span className="sr-only"> (you have this)</span></span> : skill}
              </span>
            ))}
            {skills.length > 4 ? <span className="nums text-text-subtle"> +{skills.length - 4}</span> : null}
          </p>
        ) : null}
      </div>
      {considered || role.fullTimeOffer ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          {considered ? <Pill tone="live">Offer received</Pill> : null}
          {role.fullTimeOffer ? <Pill tone="neutral">Can lead to full time</Pill> : null}
        </div>
      ) : null}
    </div>
  );
}
