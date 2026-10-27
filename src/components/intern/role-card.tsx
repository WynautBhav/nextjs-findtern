import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { CompanyInitials } from "@/components/marketing/role-card";
import { formatDayLabel } from "@/lib/format";
import { toArray } from "@/lib/journey";

/**
 * One open role, for signed-in candidates. The company is shown as initials
 * only (bug sheet 7, S1 r27/r67, S2 r5): its name is shared once it hires.
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

const MODE: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };

export function InternRoleCard({ role, considered = false }: { role: InternRole; considered?: boolean }) {
  const skills = toArray<string>(role.skills);
  const place = [role.city, role.state].filter(Boolean).join(", ");
  const mode = role.locationType ? (MODE[role.locationType.toLowerCase()] ?? role.locationType) : null;

  return (
    <Link
      href={`/intern/opportunities/${role.id}`}
      className="apple-spring group flex h-full flex-col rounded-apple-xl border border-ink-200/80 bg-white p-5 shadow-xs hover:border-brand-300 hover:shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <CompanyInitials name={role.companyName} className="size-10 text-sm" />
        <div className="min-w-0 flex-1">
          <h2 className="text-pretty text-base font-semibold tracking-[-0.015em] text-ink-900 group-hover:text-brand-800">
            {role.projectName}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
            {mode || place ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden />
                {[mode, mode === "Remote" ? null : place].filter(Boolean).join(" · ")}
              </span>
            ) : null}
            {role.createdAt ? <span>Posted {formatDayLabel(role.createdAt).toLowerCase()}</span> : null}
          </p>
        </div>
        {role.fullTimeOffer ? (
          <Pill tone="waiting" className="hidden shrink-0 sm:inline-flex">
            Can lead to full time
          </Pill>
        ) : null}
      </div>

      {role.scopeOfWork ? (
        <p className="mt-4 line-clamp-3 text-pretty text-sm leading-relaxed text-ink-700">{role.scopeOfWork}</p>
      ) : null}

      {skills.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {skills.slice(0, 5).map((skill) => (
            <li key={skill}>
              <Pill tone="neutral">{skill}</Pill>
            </li>
          ))}
          {skills.length > 5 ? (
            <li>
              <Pill tone="neutral">+{skills.length - 5}</Pill>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
        {considered ? (
          <Pill tone="live">Offer received</Pill>
        ) : role.fullTimeOffer ? (
          <Pill tone="waiting" className="sm:hidden">
            Can lead to full time
          </Pill>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 font-medium text-primary">
          Read the role
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
