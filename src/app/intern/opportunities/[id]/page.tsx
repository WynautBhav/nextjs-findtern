import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, MapPin } from "lucide-react";

import { DetailRow, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { CompanyInitials } from "@/components/marketing/role-card";
import { requireRole } from "@/lib/auth";
import { loadInternData, projectById } from "@/lib/intern-data";
import { formatDayLabel } from "@/lib/format";
import { toArray } from "@/lib/journey";

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

  const role = await projectById(id);
  if (!role) notFound();

  const data = await loadInternData(session.uid);
  const existing = data.proposals.find((p) => p.projectId === id) ?? null;
  const skills = toArray<string>(role.skills);
  const place = [role.city, role.state].filter(Boolean).join(", ");

  return (
    <div>
      <Link
        href="/intern/opportunities"
        className="apple-spring apple-pressable mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All open roles
      </Link>

      <PageHead
        title={role.projectName}
        lede={
          existing
            ? existing.status === "accepted" || existing.status === "hired"
              ? "You are doing this role now."
              : "You already have an offer for this role."
            : "This company is hiring for this right now."
        }
        action={
          existing ? (
            <Pill tone={existing.status === "sent" ? "waiting" : "live"}>
              {existing.status === "sent" ? "Offer open" : "In progress"}
            </Pill>
          ) : role.fullTimeOffer ? (
            <Pill tone="waiting">Leads to full time</Pill>
          ) : null
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          {role.scopeOfWork ? (
            <Surface className="p-6">
              <SectionHead title="What you would be doing" className="mb-0" />
              <p className="mt-3 text-pretty leading-relaxed whitespace-pre-line text-ink-700">
                {role.scopeOfWork}
              </p>
            </Surface>
          ) : null}

          {skills.length > 0 ? (
            <Surface className="mt-4 p-6">
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
            <Surface className="mt-4 p-6">
              <SectionHead title="What happens next" className="mb-0" />
            <ol className="mt-4 space-y-4">
              {[
                {
                  done: true,
                  text: "Your profile is what companies search. Everything you have filled in is what they can see.",
                },
                {
                  done: true,
                  text: "When a company is interested, they send you an offer rather than an application form.",
                },
                {
                  done: false,
                  text: "You read the offer, and you decide. Companies here cannot apply on your behalf and cannot contact you directly until you accept.",
                },
                {
                  done: false,
                  text: "Accepting starts the interview booking, your timesheet, and your stipend.",
                },
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    aria-hidden
                    className={
                      step.done
                        ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white"
                        : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink-200 text-xs font-bold text-ink-400"
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
                <Link
                  href={`/intern/proposals/${existing.id}`}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover active:scale-[0.98]"
                >
                  Open your offer
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <div>
                  <p className="text-pretty text-sm leading-relaxed text-ink-600">
                    There is no apply button on this page, and that is on purpose. Companies on
                    Findtern search for candidates rather than collecting applications, so nobody is
                    waiting on a submission from you. What gets you seen is the profile.
                  </p>
                  <Link
                    href="/intern/profile"
                    className="apple-spring apple-pressable mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover active:scale-[0.98]"
                  >
                    See what employers can see
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
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
                    <CompanyInitials name={role.companyName} className="size-7 text-[11px]" />
                    <span className="text-ink-500">Name shared with an offer</span>
                  </span>
                }
              />
              <DetailRow
                label="Where"
                value={
                  role.locationType ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                      {role.locationType.charAt(0).toUpperCase() + role.locationType.slice(1)}
                    </span>
                  ) : (
                    "Not stated"
                  )
                }
              />
              <DetailRow label="City" value={place || "Not stated"} />
              <DetailRow label="Posted" value={formatDayLabel(role.createdAt)} />
            </dl>
          </Surface>

          <Surface className="p-5">
            <SectionHead title="How you are paid" className="mb-0" />
            <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
              Stipend is agreed in the offer and shown to you before you accept. Nothing is
              negotiated behind your back and there is no rate you cannot see.
            </p>
          </Surface>
        </aside>
      </div>
    </div>
  );
}