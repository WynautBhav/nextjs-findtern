import Link from "next/link";
import { Check } from "lucide-react";

import { matchSkills, roleFacts, roleScope, type OpportunityRole } from "@/components/intern/opportunity-facts";
import { cn } from "@/lib/utils";

export { WORK_MODE, matchSkills, roleFacts, roleScope, type OpportunityRole } from "@/components/intern/opportunity-facts";

/**
 * One open role as a wide list row, in the candidates-page language: a big
 * title, one quiet facts line, the brief in two lines, skill chips (the ones
 * on your profile filled with a check, listed first, at most seven), and the
 * row's actions on the right. The company is never named or shown as
 * initials before a hire (bug sheet 7, S1 r27/r67, S2 r5). The whole row is
 * the link; `actions` sit above the stretched link so they stay clickable.
 */
export function OpportunityRow({
  role,
  href,
  mine,
  status,
  actions,
}: {
  role: OpportunityRole;
  href: string;
  /** The candidate's skills, lowercased; omitted on the public page. */
  mine?: Set<string>;
  /** "Offer received" and the like, from the caller. */
  status?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { shown, more, matched, all, has } = matchSkills(role.skills, mine);
  const facts = roleFacts(role);
  const excerpt = role.description || roleScope(role.scopeOfWork).brief;

  return (
    <article className="relative px-5 py-5 transition-colors hover:bg-ink-50/60 lg:px-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-pretty text-lg font-semibold leading-snug tracking-[-0.01em] text-ink-900">
            <Link
              href={href}
              className="rounded-apple-sm outline-none after:absolute after:inset-0 after:rounded-[inherit] hover:text-brand-700 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-600"
            >
              {role.projectName}
            </Link>
          </h2>
          {facts || role.fullTimeOffer ? (
            <p className="nums mt-1 text-sm text-ink-600">
              {facts}
              {role.fullTimeOffer ? <span className="font-medium text-brand-700">{facts ? " · " : ""}Can lead to full time</span> : null}
            </p>
          ) : null}
        </div>
        {actions ? <div className="relative z-10 -mr-2 -mt-1.5 flex shrink-0 items-start">{actions}</div> : null}
      </div>

      {/* Only when something matches: "0 of 5" on every row is noise, not a fact worth reading. */}
      {mine && matched > 0 ? (
        <p className="nums mt-3 text-sm">
          <span className="font-semibold text-brand-700">
            {matched} of {all.length}
          </span>
          <span className="text-ink-600"> skills on your profile</span>
        </p>
      ) : null}

      {excerpt ? (
        <p className="mt-2 line-clamp-2 max-w-[72ch] text-pretty text-sm leading-relaxed text-ink-600">{excerpt}</p>
      ) : null}

      {shown.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
          {shown.map((skill) => {
            const hit = mine ? has(skill) : false;
            return (
              <li
                key={skill}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium",
                  hit ? "bg-brand-100 text-brand-900" : "text-ink-700 ring-1 ring-inset ring-ink-200",
                )}
              >
                {hit ? <Check className="size-3.5 text-brand-700" strokeWidth={2.5} aria-hidden /> : null}
                {skill}
                {hit ? <span className="sr-only"> (on your profile)</span> : null}
              </li>
            );
          })}
          {more > 0 ? (
            <li className="nums inline-flex h-7 items-center px-1.5 text-[13px] font-medium text-ink-600">
              +{more}
              <span className="sr-only"> more skills</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {status ? <div className="mt-3 flex flex-wrap gap-2">{status}</div> : null}
    </article>
  );
}
