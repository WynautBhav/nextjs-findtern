"use client";

import { Eye, MapPin, Pencil, UserRound } from "lucide-react";

import { DetailRow, Pill } from "@/components/app/primitives";
import { dateLabel, widestWorkMode } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

import { Check } from "./fields";
import type { StepProps } from "./types";

/**
 * The profile the way an employer reads it, then the agreement and submit.
 * Employers see initials, never the photo or name, until they hire (NC r41),
 * so the preview shows the same.
 */
export function PreviewStep({ values, update, errors, onJumpStep }: StepProps) {
  const a = values.academics;
  const mode = widestWorkMode(values.locationTypes ?? []);
  const languages = (values.languages ?? []).filter((l) => l.language);
  const activities = (values.extracurriculars ?? []).filter((x) => x.activity.trim());
  const qualifications = [...(a.professional ?? []), ...(a.certifications ?? [])].filter((q) => q.name);

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-600">
        <Eye className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
        This is what employers see when they search. Your name, photo and contact details stay hidden until an employer hires you.
      </p>

      <article className="overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white">
        <header className="flex items-center gap-4 bg-brand-950 px-5 py-5 text-white sm:px-6">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
            <UserRound className="size-6 text-white/80" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-[-0.01em]">
              {[a.degree, a.branch].filter(Boolean).join(", ") || "Your degree"}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-on-dark-subtle">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {[values.city, values.state].filter(Boolean).join(", ") || "City not set"}
              </span>
              {mode ? <span className="capitalize">· {mode}</span> : null}
            </p>
          </div>
        </header>

        <div className="divide-y divide-ink-200/70">
          {values.bio.trim() ? (
            <Block title="About" onEdit={() => onJumpStep(0)}>
              <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink-800">{values.bio}</p>
            </Block>
          ) : null}

          <Block title="Academics" onEdit={() => onJumpStep(1)}>
            <dl className="divide-y divide-ink-100">
              <DetailRow label="Institution" value={a.institution || "-"} />
              <DetailRow label="Qualification" value={[a.qualificationLevel, a.degree].filter(Boolean).join(" · ") || "-"} />
              <DetailRow
                label="Years"
                mono
                value={`${[a.startYear, a.yearOfGraduation].filter(Boolean).join(" – ") || "-"}${a.status ? ` (${a.status.toLowerCase()})` : ""}`}
              />
              {a.cgpa ? <DetailRow label={a.scoreType === "percentage" ? "Percentage" : "CGPA"} mono value={a.scoreType === "percentage" ? `${a.cgpa}%` : `${a.cgpa} / 10`} /> : null}
            </dl>
            {qualifications.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
                {qualifications.map((q) => (
                  <li key={q.id}>
                    <span className="font-medium text-ink-900">{q.name}</span>
                    {q.level ? ` ${q.level}` : ""}
                    {q.issuer ? <span className="text-text-subtle"> · {q.issuer}</span> : null}
                    {q.completionDate ? <span className="nums text-text-subtle"> · {dateLabel(q.completionDate)}</span> : q.status === "Pursuing" ? <span className="text-text-subtle"> · pursuing</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Block>

          <Block title={`Skills (${values.skills.length})`} onEdit={() => onJumpStep(3)}>
            {values.skills.length ? (
              <ul className="flex flex-wrap gap-2">
                {values.skills.map((s) => (
                  <li key={s}>
                    <Pill tone="live">
                      {s}
                      <span className="font-normal text-brand-700/80">· {values.skillsWithRatings.find((r) => r.name.toLowerCase() === s.toLowerCase())?.rating ?? "Beginner"}</span>
                    </Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-subtle">No skills yet.</p>
            )}
          </Block>

          {values.experiences.length ? (
            <Block title="Experience" onEdit={() => onJumpStep(2)}>
              <ul className="space-y-4">
                {values.experiences.map((e) => (
                  <li key={e.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-[0.9375rem] font-medium text-ink-900">
                        {e.role || "Role"} <span className="font-normal text-ink-600">at {e.company || "-"}</span>
                      </p>
                      <p className="nums text-xs text-text-subtle">
                        {dateLabel(e.from)} – {e.current ? "Present" : dateLabel(e.to)}
                      </p>
                    </div>
                    {e.type ? <p className="text-xs text-text-subtle">{e.type}</p> : null}
                    {e.description ? <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-700">{e.description}</p> : null}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-ink-200/70">
            <Block title="Languages" onEdit={() => onJumpStep(4)}>
              <ul className="space-y-1 text-sm text-ink-800">
                {languages.map((l) => (
                  <li key={l.id}>
                    <span className="font-medium">{l.language}</span>
                    <span className="text-text-subtle"> · {l.level || "-"}</span>
                  </li>
                ))}
              </ul>
            </Block>
            <Block title="Work" onEdit={() => onJumpStep(6)} className="border-t border-ink-200/70 sm:border-t-0">
              <p className="text-sm text-ink-800">
                <span className="font-medium capitalize">{mode ?? "Not set"}</span>
                {values.preferredLocations.length ? <span className="text-ink-600"> · {values.preferredLocations.join("; ")}</span> : null}
              </p>
              <p className="mt-1 text-sm text-ink-600">{values.hasLaptop === true ? "Has a laptop" : values.hasLaptop === false ? "Needs a laptop" : "Laptop not answered"}</p>
            </Block>
          </div>

          {activities.length ? (
            <Block title="Activities" onEdit={() => onJumpStep(5)}>
              <ul className="space-y-1 text-sm text-ink-800">
                {activities.map((x) => (
                  <li key={x.id}>
                    <span className="font-medium">{x.activity}</span>
                    {x.level ? <span className="text-text-subtle"> · {x.level}</span> : null}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}
        </div>
      </article>

      <div
        id="ndaAccepted"
        tabIndex={-1}
        className={cn(
          "rounded-apple-lg border p-4 outline-none sm:p-5",
          errors.ndaAccepted ? "border-danger bg-danger-soft/40" : "border-ink-200/80 bg-ink-50/50",
        )}
      >
        <Check checked={Boolean(values.ndaAccepted)} onChange={(v) => update("ndaAccepted", v)} className="items-start">
          <span className="leading-relaxed">
            I have read and accept the{" "}
            <a href="/intern-nda" target="_blank" rel="noopener" className="font-medium text-brand-700 underline underline-offset-4">
              Internship Acceptance &amp; Non-Bypass Agreement
            </a>
            . Accepting a proposal is binding, and contact with employers stays on Findtern.
          </span>
        </Check>
        {errors.ndaAccepted ? <p className="mt-1 text-xs font-medium text-danger">{errors.ndaAccepted}</p> : null}
      </div>
    </div>
  );
}

function Block({ title, onEdit, children, className }: { title: string; onEdit: () => void; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("px-5 py-5 sm:px-6", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">{title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="apple-spring -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm px-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}
