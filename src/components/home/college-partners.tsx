/* eslint-disable @next/next/no-img-element -- partner logos are CMS URLs of unknown size */
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";

import { SectionHeading } from "@/components/ui/section-heading";
import type { CmsCollegePartner, CmsCollegePitch } from "@/lib/content/types";

/**
 * "College partners": the pitch to placement cells, and the colleges already
 * on board. With no partners listed the strip is simply absent; we never
 * show placeholder logos.
 */
export function CollegePartners({ pitch, partners }: { pitch: CmsCollegePitch; partners: CmsCollegePartner[] }) {
  return (
    <section aria-labelledby="college-partners" className="section-y border-t border-ink-100 bg-white">
      <div className="container-page">
        <SectionHeading id="college-partners" align="left" lead={pitch.lead} accent={pitch.accent} sub={pitch.sub} />

        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {pitch.points.map((p, i) => (
            <li key={p.title} className="border-t border-ink-200 pt-5">
              <span className="nums text-sm font-semibold text-brand-700">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink-900">{p.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-text-subtle">{p.body}</p>
            </li>
          ))}
        </ol>

        {partners.length ? (
          <div className="mt-12">
            <h3 className="text-[0.9375rem] font-semibold text-ink-900">Placement partners</h3>
            <ul className="mt-4 flex flex-wrap gap-3">
              {partners.map((c) => (
                <li key={c.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-2.5">
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt="" className="h-8 w-auto max-w-24 object-contain" />
                  ) : (
                    <GraduationCap className="size-5 text-brand-700" aria-hidden />
                  )}
                  <span className="text-[0.9375rem] font-medium text-ink-900">
                    {c.name}
                    {c.city ? <span className="font-normal text-text-subtle">, {c.city}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href={pitch.cta.href}
            className="apple-spring apple-pressable inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-6 text-base font-semibold text-white hover:bg-brand-600"
          >
            {pitch.cta.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href={pitch.loginHref} className="text-[0.9375rem] font-medium text-brand-700 underline-offset-4 hover:underline">
            Placement officer? Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
