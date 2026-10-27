import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, MapPin } from "lucide-react";

import { DetailRow, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { CompanyInitials } from "@/components/marketing/role-card";
import { requireRole } from "@/lib/auth";
import { loadInternData, projectById } from "@/lib/intern-data";
import { formatDayLabel } from "@/lib/format";
import { toArray } from "@/lib/journey";

import { LockedRoles, rolesGate } from "../_gate";

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

  const role = await projectById(id, { strict: true });
  if (!role) notFound();

  const data = await loadInternData(session.uid);
  const existing = data.proposals.find((p) => p.projectId === id) ?? null;
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
  const skills = toArray<string>(role.skills);
  const place = [role.city, role.state].filter(Boolean).join(", ");

  return (
    <div>
      <Link
        href="/intern/opportunities"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All open roles
      </Link>

      <PageHead
        title={role.projectName}
        lede={
          existing
            ? existing.status === "hired"
              ? "You are doing this role now."
              : "You have an offer for this role."
            : "This company is hiring for this right now."
        }
        action={
          existing ? (
            <Pill tone={existing.status === "sent" ? "waiting" : existing.status === "hired" ? "live" : "neutral"}>
              {existing.status === "sent" ? "Offer waiting on you" : existing.status === "hired" ? "Hired" : "Offer received"}
            </Pill>
          ) : role.fullTimeOffer ? (
            <Pill tone="waiting">Can lead to full time</Pill>
          ) : null
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {role.scopeOfWork ? (
            <Surface className="p-5 sm:p-6">
              <SectionHead title="What you would be doing" className="mb-0" />
              <p className="mt-3 whitespace-pre-line text-pretty text-[0.9375rem] leading-relaxed text-ink-700">
                {role.scopeOfWork}
              </p>
            </Surface>
          ) : null}

          {skills.length > 0 ? (
            <Surface className="mt-4 p-5 sm:p-6">
              <SectionHead title="What they are looking for" className="mb-0" />
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li key={skill}>
                    <Pill tone="neutral">{skill}</Pill>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}

          {/* ── The honest next step ──────────────────────────────────
              No button that pretends. What actually happens is written
              out, which is the thing a candidate is actually missing. */}
          <Surface className="mt-4 p-5 sm:p-6">
            <SectionHead title="What happens next" className="mb-0" />
            <ol className="mt-4 space-y-4">
              {[
                {
                  done: true,
                  text: "Your profile is what companies search. Everything you have filled in is what they can see.",
                },
                {
                  done: true,
                  text: "A company that likes your profile books an interview with you, then sends an offer.",
                },
                {
                  done: false,
                  text: "You read the offer and decide. The company's name and contact stay hidden until it hires you.",
                },
                {
                  done: false,
                  text: "Once you accept and the company pays, you log your hours and your stipend runs.",
                },
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    aria-hidden
                    className={
                      step.done
                        ? "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white"
                        : "nums mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-ink-200 text-xs font-semibold text-ink-600"
                    }
                  >
                    {step.done ? <Check className="size-3" strokeWidth={3.5} /> : i + 1}
                  </span>
                  <span className="text-pretty text-sm leading-relaxed text-ink-700">{step.text}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 border-t border-ink-100 pt-5">
              {existing ? (
                <ButtonLink href={`/intern/proposals/${existing.id}`}>
                  Open your offer
                  <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              ) : (
                <div>
                  <p className="text-pretty text-sm leading-relaxed text-ink-600">
                    There is no apply button, on purpose: companies on Findtern search for
                    candidates rather than collecting applications. What gets you seen is your
                    profile.
                  </p>
                  <ButtonLink href="/intern/profile" className="mt-4">
                    See what employers see
                    <ArrowRight className="size-4" aria-hidden />
                  </ButtonLink>
                </div>
              )}
            </div>
          </Surface>
        </div>

        <aside className="space-y-4">
          <Surface className="p-5">
            <SectionHead title="At a glance" className="mb-0" />
            <dl className="divide-y divide-ink-100">
              <DetailRow
                label="Company"
                value={
                  <span className="inline-flex items-center gap-2">
                    <CompanyInitials name={role.companyName} className="size-8 text-xs" />
                    <span className="text-ink-600">Name shared once hired</span>
                  </span>
                }
              />
              <DetailRow
                label="Where"
                value={
                  role.locationType ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                      {({ onsite: "On-site", hybrid: "Hybrid", remote: "Remote" } as Record<string, string>)[role.locationType.toLowerCase()] ?? role.locationType}
                    </span>
                  ) : (
                    "Not stated"
                  )
                }
              />
              <DetailRow label="City" value={place || "Not stated"} />
              <DetailRow label="Posted" mono value={formatDayLabel(role.createdAt)} />
            </dl>
          </Surface>

          <Surface className="p-5">
            <SectionHead title="How you are paid" className="mb-0" />
            <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
              The stipend is written in the offer, with the joining date and hours, and you see
              all of it before you accept.
            </p>
          </Surface>
        </aside>
      </div>
    </div>
  );
}