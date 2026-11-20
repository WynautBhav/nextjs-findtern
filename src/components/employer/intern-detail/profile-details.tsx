import { Award, GraduationCap } from "lucide-react";

import { Pill, SectionHead, Surface } from "@/components/app/primitives";
import type { Academics } from "@/lib/employer-candidates";
import { formatDate } from "@/lib/format";
import { dateLabel, type OnboardingDraft, type QualificationEntry } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/** Redacts contact details in free text until the hire is paid (the page passes its own `profileText`). */
type T = (value: string | null | undefined) => string;

export function humanise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]+/g, " ");
}

/** Institution, degree and level, then the years, score and status as small figures. */
export function EducationSection({ academics, headline, className }: { academics: Academics; headline: string; className?: string }) {
  const years = [academics.startYear, academics.endYear].filter(Boolean).join(" – ");
  const figures = [
    { label: "Years", value: years },
    { label: academics.score && academics.scoreType ? academics.scoreType.toUpperCase() : "Score", value: academics.score || "" },
    { label: "Status", value: academics.status ? humanise(academics.status) : "" },
  ].filter((f) => f.value);
  return (
    <section aria-labelledby="edu-h" className={className}>
      <SectionHead id="edu-h" title="Education" />
      <Surface className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-apple-md bg-brand-50 text-brand-700">
            <GraduationCap className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-base font-semibold text-ink-900">{academics.institution || "Institution not stated"}</p>
            <p className="mt-0.5 break-words text-sm text-ink-700">
              {[headline, academics.level ? humanise(academics.level) : ""].filter(Boolean).join(" · ") || "Degree not stated"}
            </p>
          </div>
        </div>
        {figures.length > 0 ? (
          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 border-t border-ink-100 pt-4">
            {figures.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-sm text-ink-600">{f.label}</dt>
                <dd className="nums mt-0.5 text-base font-medium text-ink-900">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Surface>
    </section>
  );
}

/** A left rule with a dot per entry, newest as the page lists them. */
export function ExperienceSection({ experiences, t, className }: { experiences: NonNullable<OnboardingDraft["experiences"]>; t: T; className?: string }) {
  return (
    <section aria-labelledby="exp-h" className={className}>
      <SectionHead id="exp-h" title="Experience and projects" />
      <Surface className="p-5 sm:p-6">
        <ol className="space-y-6 border-l-2 border-ink-200 pl-5">
          {experiences.map((exp) => (
            <li key={exp.id} className="relative">
              <span aria-hidden className={cn("absolute -left-[1.6rem] top-1.5 size-3 rounded-full ring-4 ring-white", exp.current ? "bg-brand-600" : "bg-ink-300")} />
              <p className="break-words text-base font-semibold text-ink-900">{[t(exp.role), t(exp.company)].filter(Boolean).join(" · ")}</p>
              {exp.type || exp.from || exp.to || exp.current ? (
                <p className="nums mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600">
                  {exp.type ? <Pill tone="neutral">{exp.type}</Pill> : null}
                  {[dateLabel(exp.from), exp.current ? "Present" : dateLabel(exp.to)].filter(Boolean).join(" – ")}
                </p>
              ) : null}
              {exp.description ? <p className="mt-2 max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-ink-700">{t(exp.description)}</p> : null}
            </li>
          ))}
        </ol>
      </Surface>
    </section>
  );
}

export function CertificatesSection({ qualifications, courses, t, className }: { qualifications: QualificationEntry[]; courses: Academics["courses"]; t: T; className?: string }) {
  return (
    <section aria-labelledby="cert-h" className={className}>
      <SectionHead id="cert-h" title="Certificates and courses" />
      <Surface as="ul" className="divide-y divide-ink-100">
        {qualifications.map((q) => (
          <Row key={q.id} title={t(q.name)} detail={[t(q.issuer), q.completionDate && formatDate(q.completionDate)].filter(Boolean).join(" · ")} />
        ))}
        {courses.map((course, i) => (
          <Row key={`${course.name}-${i}`} title={t(course.name)} detail={[t(course.institution), course.level, course.completed, course.score].filter(Boolean).join(" · ")} />
        ))}
      </Surface>
    </section>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 px-5 py-4 sm:px-6">
      <Award className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
      <div className="min-w-0">
        <p className="break-words text-base font-medium text-ink-900">{title}</p>
        <p className="nums mt-0.5 text-sm text-ink-600">{detail || "No further detail recorded"}</p>
      </div>
    </li>
  );
}

/** Languages as a name, level and Read/Write/Speak mini-pills; activities as a quiet list beside it. */
export function LanguagesActivities({
  languages,
  activities,
  t,
  className,
}: {
  languages: NonNullable<OnboardingDraft["languages"]>;
  activities: NonNullable<OnboardingDraft["extracurriculars"]>;
  t: T;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-x-6 gap-y-8", languages.length > 0 && activities.length > 0 && "md:grid-cols-2", className)}>
      {languages.length > 0 ? (
        <section aria-labelledby="lang-h" className="min-w-0">
          <SectionHead id="lang-h" title="Languages" />
          <Surface as="ul" className="divide-y divide-ink-100">
            {languages.map((l) => (
              <li key={l.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium text-ink-900">{l.language}</span>
                  {l.level ? <span className="text-sm text-ink-600">{l.level}</span> : null}
                </div>
                {l.read || l.write || l.speak ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${l.language} abilities`}>
                    {[l.read && "Read", l.write && "Write", l.speak && "Speak"].filter(Boolean).map((ability) => (
                      <li key={String(ability)}>
                        <Pill tone="live">{ability}</Pill>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </Surface>
        </section>
      ) : null}
      {activities.length > 0 ? (
        <section aria-labelledby="act-h" className="min-w-0">
          <SectionHead id="act-h" title="Activities" />
          <Surface as="ul" className="divide-y divide-ink-100">
            {activities.map((a) => (
              <li key={a.id} className="px-5 py-3.5">
                <span className="break-words font-medium text-ink-900">{t(a.activity)}</span>
                <span className="block text-sm text-ink-600">{[a.category, a.level].filter(Boolean).join(", ")}</span>
              </li>
            ))}
          </Surface>
        </section>
      ) : null}
    </div>
  );
}
