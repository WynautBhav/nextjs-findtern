import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Check } from "lucide-react";

import { PageHead, Pill, Surface } from "@/components/app/primitives";
import { WORK_MODE, roleFacts, roleScope } from "@/components/intern/opportunity-row";
import { SaveRoleButton } from "@/components/intern/save-role-button";
import { ButtonLink } from "@/components/ui/button";
import { CompanyInitials } from "@/components/marketing/role-card";
import { proposalStatus } from "@/components/app/status";
import { requireRole } from "@/lib/auth";
import { loadInternData, projectById } from "@/lib/intern-data";
import { formatDayLabel } from "@/lib/format";
import { toArray } from "@/lib/journey";
import { savedProjectIds } from "@/lib/saved-roles";
import { readSkillRatings } from "@/lib/onboarding";

import { LockedRoles, rolesGate } from "../_gate";
import { isHiredProposal } from "@/lib/hire-status";

export const metadata: Metadata = {
  title: "Role",
  robots: { index: false, follow: false },
};

/**
 * One role, in full.
 *
 * The old opportunities screen showed three lines of scope, clipped after
 * three lines, on a card that was not a link. There was no detail route at all,
 * so the only thing a candidate could learn about a role was the truncated
 * summary, and there was no way to express interest.
 *
 * There is still no apply button, and that is deliberate. The backend has no
 * candidate initiated application endpoint, and inventing one would be a
 * capability this product does not have. So the page does what it can honestly
 * do: it gives the whole brief, it says exactly what happens next, and it
 * points at the thing that does work. Building a button that leads nowhere is
 * the failure mode this whole redesign exists to remove.
 */
export default async function RoleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("intern");

  const [role, data] = await Promise.all([projectById(id, { strict: true, anyStatus: true }), loadInternData(session.uid)]);
  if (!role) notFound();

  // A closed offer (rejected, withdrawn, expired) is not an offer: the role reads as open.
  const existing = data.proposals.find((p) => p.projectId === id && (isHiredProposal(p) || proposalStatus(p.status).tone !== "closed")) ?? null;
  // A hire is a hire whether the status or only hiredAt says so (QA-010).
  const hired = existing ? isHiredProposal(existing) : false;
  // Paused, closed and taken-down roles, and inactive or test employers, are gone unless this candidate already has an offer on it.
  if (!existing && !(await projectById(id, { strict: true }))) notFound();
  // A role they already have an offer on stays readable; anything else waits
  // for the same unlock as the list.
  if (!existing) {
    const gate = await rolesGate(session.uid, data);
    if (!gate.unlocked) {
      return (
        <div>
          <PageHead title="Open roles" lede="What companies are hiring for right now." />
          <LockedRoles {...gate} />
        </div>
      );
    }
  }
  const saved = existing ? false : (await savedProjectIds(session.uid)).has(id);
  const skills = toArray<string>(role.skills);
  const mine = new Set(
    readSkillRatings(data.onboarding?.skills, (data.onboarding?.extraData ?? {}) as Record<string, unknown>).map((s) => s.name.toLowerCase().trim()),
  );
  const has = (skill: string) => mine.has(skill.toLowerCase().trim());
  const sorted = [...skills].sort((a, b) => Number(has(b)) - Number(has(a)));
  const matched = skills.filter(has).length;
  const place = [role.city, role.state].filter(Boolean).join(", ");
  const facts = roleFacts(role);
  const mode = role.locationType ? (WORK_MODE[role.locationType.toLowerCase()] ?? role.locationType) : null;
  const brief = roleScope(role.scopeOfWork).brief;
  const sections = [
    brief ? { title: "What you would be doing", body: brief } : null,
    role.description ? { title: "About the work", body: role.description } : null,
  ].filter((x): x is { title: string; body: string } => Boolean(x));
  const statusLabel = existing ? (hired ? "Hired" : existing.status === "sent" ? "Offer waiting on you" : "Offer received") : null;

  return (
    <div>
      <Link
        href="/intern/opportunities"
        className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm px-1 text-sm font-medium text-ink-600 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All open roles
      </Link>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-pretty text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">{role.projectName}</h1>
            {/* Save sits where it sits on the list row: beside the title. */}
            {existing ? null : (
              <div className="shrink-0">
                <SaveRoleButton projectId={role.id} projectName={role.projectName} initialSaved={saved} className="rounded-full ring-1 ring-inset ring-ink-200" />
              </div>
            )}
          </div>
          {facts ? <p className="nums mt-1.5 text-sm text-ink-600">{facts}</p> : null}
          {statusLabel || role.fullTimeOffer ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {statusLabel ? <Pill tone={hired ? "live" : existing!.status === "sent" ? "waiting" : "neutral"}>{statusLabel}</Pill> : null}
              {role.fullTimeOffer ? <Pill tone="neutral">Can lead to full time</Pill> : null}
            </div>
          ) : null}

          <Surface className="mt-6 divide-y divide-ink-100">
            {sections.map((sec) => (
              <section key={sec.title} className="p-5 sm:p-6">
                <h2 className="text-base font-semibold text-ink-900">{sec.title}</h2>
                <p className="mt-2 max-w-prose whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700">{sec.body}</p>
              </section>
            ))}

            {skills.length > 0 ? (
              <section className="p-5 sm:p-6">
                <h2 className="text-base font-semibold text-ink-900">What they are looking for</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
                  {sorted.map((skill) => (
                    <li
                      key={skill}
                      className={
                        has(skill)
                          ? "inline-flex h-7 items-center gap-1 rounded-full bg-brand-100 px-2.5 text-[13px] font-medium text-brand-900"
                          : "inline-flex h-7 items-center rounded-full px-2.5 text-[13px] font-medium text-ink-700 ring-1 ring-inset ring-ink-200"
                      }
                    >
                      {has(skill) ? <Check className="size-3.5 text-brand-700" strokeWidth={2.5} aria-hidden /> : null}
                      {skill}
                      {has(skill) ? <span className="sr-only"> (on your profile)</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* The explainer is for someone without an offer; with one it only
                contradicted where they are (steps 3-4 undone for a hire). */}
            {existing ? null : (
              <section className="p-5 sm:p-6">
                <h2 className="text-base font-semibold text-ink-900">What happens next</h2>
                <ol className="mt-4 space-y-3">
                  {[
                    { done: true, text: "Your profile is what companies search. Everything you have filled in is what they can see." },
                    // Not done: without an offer on this role, nobody has booked them yet.
                    { done: false, text: "A company that likes your profile books an interview with you, then sends an offer." },
                    { done: false, text: "You read the offer and decide. The company's name and contact stay hidden until it hires you." },
                    { done: false, text: "Once you accept and the company pays, you log your hours and your stipend runs." },
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        className={
                          step.done
                            ? "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white"
                            : "nums mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-ink-200 text-xs font-semibold text-ink-600"
                        }
                      >
                        {step.done ? <Check className="size-3" strokeWidth={3.5} aria-label="Done" /> : <span aria-hidden>{i + 1}</span>}
                      </span>
                      <span className="text-pretty text-sm leading-relaxed text-ink-700">{step.text}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </Surface>
        </div>

        {/* The action card: on a phone it follows the brief, on a desktop it rides beside it. */}
        <aside className="lg:sticky lg:top-24 lg:self-start lg:pt-1">
          <Surface className="p-5 sm:p-6">
            {skills.length > 0 ? (
              matched > 0 ? (
                <p className="nums text-sm text-ink-600">
                  <span className="text-2xl font-semibold text-brand-700">
                    {matched} of {skills.length}
                  </span>
                  <span className="mt-0.5 block">skills on your profile</span>
                </p>
              ) : (
                <p className="text-pretty text-sm text-ink-600">None of the {skills.length} skills this role asks for are on your profile yet.</p>
              )
            ) : null}

            <div className={skills.length > 0 ? "mt-4" : undefined}>
              {existing ? (
                <ButtonLink href={`/intern/proposals/${existing.id}`} block>
                  {hired ? "Open your placement" : "Open your offer"}
                  <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              ) : (
                <>
                  <p className="text-pretty text-sm leading-relaxed text-ink-600">
                    There is no apply button. Saving this role (the heart) moves you up in this company&apos;s search when your skills match, and never changes your Findtern Score.
                  </p>
                  <Link
                    href="/intern/profile"
                    className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    See what employers see
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </>
              )}
            </div>

            <dl className="mt-4 divide-y divide-ink-100 border-t border-ink-100 text-sm">
              <div className="flex items-start justify-between gap-4 py-2.5">
                <dt className="text-ink-600">Company</dt>
                <dd className="flex items-center gap-2 text-right font-medium text-ink-900">
                  {/* Initials would identify the company before the hire; a neutral mark until then. */}
                  {hired ? (
                    <>
                      <CompanyInitials name={role.companyName} className="size-6 text-2xs" />
                      {data.names[existing!.employerId] ?? role.companyName}
                    </>
                  ) : (
                    <>
                      <Building2 className="size-4 shrink-0 text-text-subtle" aria-hidden />
                      <span className="font-normal text-ink-600">Shared once hired</span>
                    </>
                  )}
                </dd>
              </div>
              {[
                ["Where", mode ?? "Not stated"],
                ["City", mode === "Remote" ? "Anywhere" : place || "Not stated"],
                ["Posted", formatDayLabel(role.createdAt)],
                ["Stipend", "Written in the offer, before you accept"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-ink-600">{k}</dt>
                  <dd className="text-right font-medium text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
