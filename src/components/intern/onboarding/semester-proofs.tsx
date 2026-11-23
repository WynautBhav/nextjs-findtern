"use client";

import { useState } from "react";
import { Check, Info, ShieldCheck } from "lucide-react";

import { FileUpload } from "@/components/app/file-upload";
import { CGPA_DISCLAIMER, CGPA_UPLOAD_WARNING, proofSlots, SEMESTER_NA, semesterFromInput } from "@/lib/cgpa-verification";
import type { CertificateUpload, OnboardingDraft } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

import { Check as CheckField, FieldNote, Label, RemoveButton, controlClass, describedBy } from "./fields";

type Academics = OnboardingDraft["academics"];

const MB = 1024 * 1024;
const FILE_TYPES = "image/jpeg,image/png";

/** The CGPA notice, as a callout with an icon (not a modal, nothing to tick). */
export function CgpaDisclaimer({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <p className={cn("flex items-start gap-2 text-xs leading-relaxed text-text-subtle", className)}>
        <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
        <span>{CGPA_DISCLAIMER}</span>
      </p>
    );
  }
  return (
    <div className={cn("flex items-start gap-3 rounded-apple-sm border border-info/25 bg-info-soft px-4 py-3", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
      <div className="space-y-2 text-sm leading-relaxed text-ink-900">
        <p>{CGPA_DISCLAIMER}</p>
        <p role="note" className="font-medium">{CGPA_UPLOAD_WARNING}</p>
      </div>
    </div>
  );
}

/**
 * "Current semester": typed by hand (any semester from 1 to 10, whatever the year of study), with a small "Not
 * applicable" box beside it for colleges that run on yearly exams (stored as `SEMESTER_NA`, 0). Ticking the box
 * clears the number and disables it; unticking leaves the semester empty again.
 */
export function SemesterInput({ a, error, onChange }: { a: Academics; error?: string; onChange: (semester: number | null) => void }) {
  const id = "currentSemester";
  const current = typeof a.currentSemester === "number" ? a.currentSemester : null;
  const na = current === SEMESTER_NA;
  const hint = na ? "For colleges without semesters. You upload last year's marksheet instead." : "The semester you are studying in now, 1 to 10.";
  return (
    <div className="min-w-0">
      <Label htmlFor={id} optional>
        Current semester
      </Label>
      <div className="mt-2 flex items-center gap-x-4 gap-y-1">
        <input
          id={id}
          name={id}
          inputMode="numeric"
          maxLength={2}
          placeholder="e.g. 5"
          disabled={na}
          value={current !== null && !na ? String(current) : ""}
          onChange={(e) => onChange(semesterFromInput(e.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={controlClass(error, "nums min-w-0 flex-1 disabled:cursor-not-allowed disabled:opacity-60")}
        />
        <CheckField checked={na} onChange={(checked) => onChange(checked ? SEMESTER_NA : null)} className="shrink-0">
          Not applicable<span className="sr-only"> (my course has no semesters)</span>
        </CheckField>
      </div>
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

/**
 * The proof photos for the chosen semester: one labelled slot per earlier semester's marksheet and one for the
 * college ID card, so semester N has N slots. Every slot is required once a score is entered; each shows its own
 * state (needed, uploading with progress, uploaded) and its own error. Uploads use the `certificate` kind: JPG or
 * PNG, shrunk in the browser, re-encoded and size-capped by the server.
 */
export function SemesterProofs({ a, errors, onChange }: { a: Academics; errors: Record<string, string>; onChange: (proofs: Record<string, CertificateUpload>) => void }) {
  const semester = typeof a.currentSemester === "number" ? a.currentSemester : null;
  const [nonce, setNonce] = useState<Record<string, number>>({});
  if (semester === null) return null;
  const slots = proofSlots(semester);
  const proofs = a.semesterProofUploads ?? {};
  const haveScore = Boolean((a.cgpa ?? "").trim());
  const done = slots.filter((s) => proofs[s.key]?.name).length;

  return (
    <div className="space-y-4">
      <CgpaDisclaimer />
      {!haveScore ? (
        <p className="rounded-apple-sm border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700">
          Enter your score above and we will ask for the {slots.length} proof photo{slots.length === 1 ? "" : "s"} {semester === SEMESTER_NA ? "of your last year's marksheet" : `for semester ${semester}`}.
        </p>
      ) : (
        <>
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-ink-800">
            <ShieldCheck className="size-4 text-brand-600" aria-hidden />
            <span className="nums">
              {done} of {slots.length} proof photo{slots.length === 1 ? "" : "s"} uploaded
            </span>
          </p>
          <ul className="space-y-3">
            {slots.map((slot) => {
              const u = proofs[slot.key];
              const id = `proof-${slot.key}`;
              const error = errors[id];
              return (
                <li
                  key={slot.key}
                  id={id}
                  tabIndex={-1}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className={cn(
                    "rounded-apple-sm border bg-white p-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                    error ? "border-danger" : u ? "border-brand-200" : "border-ink-200",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-900">
                      {u ? <Check className="size-4 shrink-0 text-brand-600" aria-hidden /> : null}
                      <span>{slot.label}</span>
                      <span className="text-xs font-medium text-danger">
                        {u ? <span className="sr-only">Uploaded</span> : "Required"}
                      </span>
                    </p>
                    {u ? <RemoveButton label={`Remove ${slot.label}`} onClick={() => {
                      const next = { ...proofs };
                      delete next[slot.key];
                      onChange(next);
                      setNonce((n) => ({ ...n, [slot.key]: (n[slot.key] ?? 0) + 1 }));
                    }} /> : null}
                  </div>
                  <FileUpload
                    key={`${slot.key}-${nonce[slot.key] ?? 0}`}
                    className="mt-3"
                    kind="certificate"
                    accept={FILE_TYPES}
                    label={slot.label}
                    noun="photo"
                    current={u?.originalName ?? null}
                    maxBytes={1 * MB}
                    shrink
                    hint="A clear JPG or PNG photo. We shrink it for you."
                    onUploaded={(r) => onChange({ ...proofs, [slot.key]: { name: r.key, originalName: r.name, type: r.contentType, size: r.bytes } })}
                  />
                  {error ? (
                    <p id={`${id}-error`} className="mt-2 text-sm font-medium text-danger">
                      {error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
