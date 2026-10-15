import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, MapPin } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { projectById } from "@/lib/intern-data";
import { formatDayLabel } from "@/lib/format";
import { toArray } from "@/lib/journey";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const role = await projectById(id);
  if (!role) return { title: "Role not found" };
  return {
    title: `${role.projectName} at ${role.companyName}`,
    description: role.scopeOfWork ?? undefined,
    alternates: { canonical: `/opportunities/${role.id}` },
  };
}

/**
 * Public role detail.
 *
 * The signed-in version at /intern/opportunities/[id] adds the candidate's own
 * state - which offers they already hold, and what to do next for them. A
 * guest has none of that, so this is the brief, the skills, the facts, and an
 * honest account of what creating a profile would do. No apply button, because
 * there is no application to submit: companies search candidates, they do not
 * collect applications.
 */
export default async function PublicRoleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await projectById(id);
  if (!role) notFound();

  const skills = toArray<string>(role.skills);
  const place = [role.city, role.state].filter(Boolean).join(", ");

  return (
    <div>
      <section className="container-page pt-10">
        <Link
          href="/opportunities"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors duration-[var(--dur-instant)] hover:text-ink-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All open roles
        </Link>
      </section>

      <section className="container-page pt-6 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-ink-500">{role.companyName}</p>
            <h1 className="mt-1 text-pretty text-3xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-4xl">
              {role.projectName}
            </h1>
          </div>
          {role.fullTimeOffer ? <Pill tone="waiting">Leads to full time</Pill> : null}
        </div>
      </section>

      <section className="container-page section-y">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            {role.scopeOfWork ? (
              <div>
                <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">What you would be doing</h2>
                <p className="text-pretty leading-relaxed whitespace-pre-line text-ink-700">
                  {role.scopeOfWork}
                </p>
              </div>
            ) : null}

            {skills.length > 0 ? (
              <div className="mt-10">
                <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">What they are looking for</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <li key={skill}>
                      <Pill tone="neutral">{skill}</Pill>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-10">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">What happens next</h2>
              <ol className="space-y-4">
                {[
                  "Your profile is what companies search. Everything you have filled in is what they can see.",
                  "When a company is interested, they send you an offer rather than an application form.",
                  "You read the offer, and you decide. Companies cannot apply on your behalf and cannot contact you directly until you accept.",
                  "Accepting starts the interview booking, your timesheet, and your stipend.",
                ].map((text, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      aria-hidden
                      className={
                        i < 2
                          ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white"
                          : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink-200 text-2xs font-bold text-ink-400"
                      }
                    >
                      {i < 2 ? <Check className="size-3" strokeWidth={3.5} /> : i + 1}
                    </span>
                    <span className="text-pretty text-sm leading-relaxed text-ink-700">{text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-ink-100 bg-white p-5">
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">At a glance</h2>
              <dl className="mt-3 divide-y divide-ink-100">
                <div className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-sm text-ink-500">Company</dt>
                  <dd className="text-right text-sm font-medium text-ink-900">
                    {role.companyName}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-sm text-ink-500">Where</dt>
                  <dd className="flex items-center gap-1.5 text-right text-sm font-medium text-ink-900">
                    {role.locationType ? (
                      <>
                        <MapPin className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                        {role.locationType}
                      </>
                    ) : (
                      "Not stated"
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-sm text-ink-500">City</dt>
                  <dd className="text-right text-sm font-medium text-ink-900">
                    {place || "Not stated"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-sm text-ink-500">Posted</dt>
                  <dd className="text-right text-sm font-medium text-ink-900">
                    {formatDayLabel(role.createdAt)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-brand-900">
                Get considered for this
              </h2>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-brand-800">
                There is no apply button because there is no application to submit - companies here
                search candidates. A free profile plus the AI interview is what puts you in front of
                them.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <ButtonLink href="/signup" variant="primary" block>
                  Create a free profile
                </ButtonLink>
                <ButtonLink href="/login" variant="outline" block>
                  I already have an account
                </ButtonLink>
              </div>
            </div>

            <div className="rounded-xl border border-ink-100 bg-white p-5">
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
                How you are paid
              </h2>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
                Stipend is agreed in the offer and shown to you before you accept. Nothing is
                negotiated behind your back and there is no rate you cannot see.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}