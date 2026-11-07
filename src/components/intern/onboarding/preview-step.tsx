"use client";

import { Eye, MapPin, Pencil } from "lucide-react";

import { DetailRow, Pill } from "@/components/app/primitives";
import { RowAvatar } from "@/components/employer/candidate-row-parts";
import { initialsOf } from "@/lib/employer-candidates";
import { dateLabel, widestWorkMode } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

import { Check } from "./fields";
import type { StepProps } from "./types";

/**
 * The profile the way an employer reads it, then the agreement and submit.
 * Before a hire employers see the photo and initials, never the name or contact
 * details (owner call, 6 Nov), so the preview shows the same.
 */
export function PreviewStep({ values, update, errors, documents, onJumpStep }: StepProps) {
  const photoSrc = values.photoUrl || (documents.some((d) => d.label === "Profile photo") ? "/api/intern/avatar" : "");
  const a = values.academics;
  const mode = widestWorkMode(values.locationTypes ?? []);
  const languages = (values.languages ?? []).filter((l) => l.language);
  const activities = (values.extracurriculars ?? []).filter((x) => x.activity.trim());
  const qualifications = [...(a.professional ?? []), ...(a.certifications ?? [])].filter((q) => q.name);

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-3 text-sm leading-relaxed text-ink-600">
        <Eye className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
        This is what employers see when they search: your photo, initials, city, score and up to 7 skills. Your name and contact details stay hidden until a company hires you.
      </p>

      <article className="overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white">
        <header className="flex items-center gap-4 bg-brand-950 px-5 py-5 text-white sm:px-6">
          <RowAvatar photoUrl={photoSrc} initials={initialsOf(values.firstName ?? "", values.lastName ?? "")} />
          <div className="min-w-0">
            <p className="[overflow-wrap:anywhere] text-lg font-semibold tracking-[-0.01em]">
              {[a.degree, a.branch].filter(Boolean).join(", ") || "Your degree"}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-on-dark-subtle">
              <span className="inline-flex min-w-0 items-center gap-1 [overflow-wrap:anywhere]">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                {[values.city, values.state].filter(Boolean).join(", ") || "City not set"}
              </span>
              {mode ? <span className="capitalize">· {mode}</span> : null}
            </p>
          </div>
        </header>

        <div className="divide-y divide-ink-200/70">
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
              <ul className="mt-3 space-y-1.5 text-sm text-ink-700 [overflow-wrap:anywhere]">
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
                  <li key={s} className="max-w-full">
                    <Pill tone="live" className="max-w-full text-left [overflow-wrap:anywhere]">
                      {s}
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
                      <p className="min-w-0 text-base font-medium text-ink-900 [overflow-wrap:anywhere]">
                        {e.role || "Role"} <span className="font-normal text-ink-600">at {e.company || "-"}</span>
                      </p>
                      <p className="nums text-xs text-text-subtle">
                        {dateLabel(e.from)} – {e.current ? "Present" : dateLabel(e.to)}
                      </p>
                    </div>
                    {e.type ? <p className="text-xs text-text-subtle [overflow-wrap:anywhere]">{e.type}</p> : null}
                    {e.description ? <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{e.description}</p> : null}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-ink-200/70">
            <Block title="Languages" onEdit={() => onJumpStep(4)}>
              <ul className="space-y-1 text-sm text-ink-800 [overflow-wrap:anywhere]">
                {languages.map((l) => (
                  <li key={l.id}>
                    <span className="font-medium">{l.language}</span>
                    <span className="text-text-subtle"> · {l.level || "-"}</span>
                  </li>
                ))}
              </ul>
            </Block>
            <Block title="Work" onEdit={() => onJumpStep(6)} className="border-t border-ink-200/70 sm:border-t-0">
              <p className="text-sm text-ink-800 [overflow-wrap:anywhere]">
                <span className="font-medium capitalize">{mode ?? "Not set"}</span>
                {values.preferredLocations.length ? <span className="text-ink-600"> · {values.preferredLocations.join("; ")}</span> : null}
              </p>
              <p className="mt-1 text-sm text-ink-600">{values.hasLaptop === true ? "Has a laptop" : values.hasLaptop === false ? "Needs a laptop" : "Laptop not answered"}</p>
            </Block>
          </div>

          {activities.length ? (
            <Block title="Activities" onEdit={() => onJumpStep(5)}>
              <ul className="space-y-1 text-sm text-ink-800 [overflow-wrap:anywhere]">
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
          "rounded-apple-xl border p-4 outline-none sm:p-5",
          errors.ndaAccepted ? "border-danger bg-danger-soft/40" : "border-ink-200/80 bg-ink-50/50",
        )}
      >
        <Check checked={Boolean(values.ndaAccepted)} onChange={(v) => update("ndaAccepted", v)} className="items-start">
          <span className="min-w-0 leading-relaxed [overflow-wrap:anywhere]">
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
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
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
