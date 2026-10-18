import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, MapPin } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { formatDayLabel } from "@/lib/format";
import { toArray } from "@/lib/journey";

/**
 * One open role, as a card.
 *
 * Shared by the public browse page and the signed-in list so the two cannot
 * drift apart - a role that looks one way to a guest and another way to a
 * candidate is the sort of inconsistency nobody notices until it costs a
 * signup.
 *
 * `applied` is the only difference between the two callers: a signed-in
 * candidate sees which roles they have already been considered for, a guest
 * sees nothing that would require an account to understand.
 */

export type RoleCardRole = {
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

export function RoleCard({
  role,
  applied = false,
  hrefBase = "/opportunities",
}: {
  role: RoleCardRole;
  applied?: boolean;
  hrefBase?: string;
}) {
  const skills = toArray<string>(role.skills);
  const place = [role.city, role.state].filter(Boolean).join(", ");

  return (
    <Link
      href={`${hrefBase}/${role.id}`}
      className="group flex h-full flex-col rounded-2xl border border-ink-100 bg-white p-5 transition-[border-color,box-shadow,transform] duration-[var(--dur-standard)] hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_14px_34px_-18px_rgb(7_47_36/0.32)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-pretty text-base font-semibold tracking-[-0.015em] text-ink-900">
            {role.projectName}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
            <BriefcaseBusiness className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{role.companyName}</span>
          </p>
        </div>
        {role.fullTimeOffer ? (
          <Pill tone="waiting" className="shrink-0 whitespace-nowrap">
            Leads to full time
          </Pill>
        ) : null}
      </div>

      {role.scopeOfWork ? (
        <p className="mt-3.5 line-clamp-3 text-pretty text-sm leading-relaxed text-ink-600">
          {role.scopeOfWork}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        {place || role.locationType ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {role.locationType ? capitalise(role.locationType) : place}
            {place && role.locationType ? ` in ${place}` : ""}
          </span>
        ) : null}
        {role.createdAt ? (
          <span className="text-xs text-ink-400">
            Posted {formatDayLabel(role.createdAt).toLowerCase()}
          </span>
        ) : null}
        {applied ? (
          <span className="ml-auto text-xs font-semibold text-brand-700">Already considered</span>
        ) : (
          <ArrowRight
            className="ml-auto size-4 text-ink-400 transition-[transform,color] duration-[var(--dur-instant)] group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden
          />
        )}
      </div>

      {skills.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
          {skills.slice(0, 4).map((skill) => (
            <li key={skill}>
              <Pill tone="neutral">{skill}</Pill>
            </li>
          ))}
          {skills.length > 4 ? (
            <li>
              <Pill tone="neutral">+{skills.length - 4} more</Pill>
            </li>
          ) : null}
        </ul>
      ) : null}
    </Link>
  );
}

function capitalise(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}