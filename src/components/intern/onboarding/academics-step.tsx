"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { FileUpload } from "@/components/app/file-upload";
import { suggestColleges } from "@/lib/data/colleges";
import {
  DEGREES_BY_LEVEL,
  MAX_CERTIFICATE_UPLOADS,
  MAX_MARKSHEETS,
  PROFESSIONAL_PRESETS,
  QUALIFICATION_LEVELS,
  degreeOption,
  levelHasDegreeList,
  type CertificateUpload,
  type OnboardingDraft,
  type QualificationEntry,
  type ScoreType,
} from "@/lib/onboarding";

import { DateField, localToday } from "../date-input";
import { AddButton, Choice, EmptyEntries, EntryCard, Field, FieldNote, Grid, Label, RemoveButton, Section, Select, SelectField, controlClass } from "./fields";
import type { StepProps } from "./types";

const MB = 1024 * 1024;
const FILE_TYPES = "image/jpeg,image/png,image/webp,application/pdf";
const STATUS = [
  { value: "Completed", label: "Completed" },
  { value: "Pursuing", label: "Pursuing" },
] as const;
const SCORE_TYPES = [
  { value: "cgpa", label: "CGPA" },
  { value: "percentage", label: "Percentage" },
] as const;

type Academics = OnboardingDraft["academics"];

export function AcademicsStep({ values, update, errors }: StepProps) {
  const a = values.academics;
  const set = (patch: Partial<Academics>) => update("academics", { ...a, ...patch });
  const level = a.qualificationLevel ?? "";
  const hasList = levelHasDegreeList(level);
  const option = hasList ? degreeOption(a.degree, level) : "";
  // Kept while typing, so a custom name that happens to match a list entry
  // ("BA" on the way to "BArch") does not swap the text box out mid-word.
  const [typingOther, setTypingOther] = useState(option === "Other");
  const showOther = hasList && (typingOther || option === "Other");
  const completed = a.status === "Completed";
  const phd = level === "Ph.D";
  const levels = !level || QUALIFICATION_LEVELS.some((l) => l.value === level) ? [...QUALIFICATION_LEVELS] : [...QUALIFICATION_LEVELS, { value: level, label: level }];
  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-8">
      <Section first title="Highest qualification">
        <Grid>
          <SelectField
            id="qualificationLevel"
            label="Level"
            placeholder="Choose your level"
            value={level}
            error={errors.qualificationLevel}
            options={levels}
            onChange={(v) => {
              setTypingOther(false);
              // The degree list depends on the level, so it starts again (legacy).
              set({ qualificationLevel: v, degree: "", ...(v === "Ph.D" ? { cgpa: "", scoreType: "" } : {}) });
            }}
          />
          <Choice id="academicStatus" label="Status" value={a.status as "Completed" | "Pursuing" | ""} options={STATUS} error={errors.academicStatus} onChange={(v) => set({ status: v })} />
        </Grid>

        <Field
          id="institution"
          label="College or university"
          placeholder="e.g. JECRC University, IIT Bombay"
          value={a.institution}
          error={errors.institution}
          autoComplete="off"
          hint="Start typing to pick from the list, or type the full name."
          onChange={(v) => set({ institution: v })}
        />
        <CollegeSuggestions query={a.institution} onPick={(v) => set({ institution: v })} />

        <Grid>
          {hasList ? (
            <SelectField
              id={showOther ? "degreeSelect" : "degree"}
              label="Degree"
              placeholder="Choose your degree"
              value={showOther ? "Other" : option}
              error={showOther ? undefined : errors.degree}
              options={[...(DEGREES_BY_LEVEL[level] ?? []).map((d) => ({ value: d, label: d })), { value: "Other", label: "Other" }]}
              onChange={(v) => {
                if (v === "Other") {
                  setTypingOther(true);
                  set({ degree: option === "Other" ? a.degree : "" });
                } else {
                  setTypingOther(false);
                  set({ degree: v });
                }
              }}
            />
          ) : (
            <Field
              id="degree"
              label={phd ? "Ph.D subject" : level === "Diploma" ? "Diploma" : "Degree"}
              placeholder={phd ? "e.g. Computational Biology" : level ? "e.g. Diploma in Civil Engineering" : "Choose your level first"}
              value={a.degree}
              disabled={!level}
              error={errors.degree}
              onChange={(v) => set({ degree: v })}
            />
          )}
          <Field
            id="branch"
            label="Specialization"
            optional
            placeholder="e.g. Computer Science, Marketing"
            value={a.branch}
            error={errors.branch}
            onChange={(v) => set({ branch: v })}
          />
          {showOther ? (
            <Field
              id="degree"
              label="Degree name"
              placeholder="e.g. B.Arch"
              value={a.degree === "Other" ? "" : a.degree}
              error={errors.degree}
              onChange={(v) => set({ degree: v })}
            />
          ) : null}
        </Grid>

        <Grid>
          <Field
            id="startYear"
            label="Start year"
            placeholder="YYYY"
            inputMode="numeric"
            maxLength={4}
            inputClassName="nums"
            value={a.startYear}
            error={errors.startYear}
            onChange={(v) => set({ startYear: v.replace(/\D/g, "").slice(0, 4) })}
          />
          <Field
            id="yearOfGraduation"
            label={completed ? "End year" : "Expected end year"}
            optional={!completed}
            placeholder="YYYY"
            inputMode="numeric"
            maxLength={4}
            inputClassName="nums"
            value={a.yearOfGraduation}
            error={errors.yearOfGraduation}
            hint={completed ? `${thisYear} or earlier.` : a.status === "Pursuing" ? `${thisYear} to ${thisYear + 6}.` : undefined}
            onChange={(v) => set({ yearOfGraduation: v.replace(/\D/g, "").slice(0, 4) })}
          />
        </Grid>

        {phd ? null : (
          <Grid>
            <Choice
              id="scoreType"
              label="Score type"
              optional={!completed}
              value={a.scoreType}
              options={SCORE_TYPES}
              error={errors.scoreType}
              onChange={(v) => set({ scoreType: v })}
            />
            <Field
              id="cgpa"
              label={completed ? "Final score" : "Score so far"}
              optional={!completed}
              inputMode="decimal"
              placeholder={a.scoreType === "percentage" ? "e.g. 84" : "e.g. 8.4"}
              inputClassName="nums"
              value={a.cgpa}
              error={errors.cgpa}
              hint={a.scoreType === "percentage" ? "Out of 100." : a.scoreType === "cgpa" ? "Out of 10." : "Pick CGPA or percentage first."}
              onChange={(v) => set({ cgpa: v.replace(/[^\d.]/g, "").slice(0, 6) })}
            />
          </Grid>
        )}
      </Section>

      <Section title={phd ? "Certificates" : "Marksheets"} hint="Your latest semester or final marksheet. Optional - you can add several.">
        <FileList
          rowId="marksheets"
          files={a.marksheetUploads ?? []}
          max={MAX_MARKSHEETS}
          kind="marksheet"
          noun={phd ? "certificate" : "marksheet"}
          onChange={(marksheetUploads) => set({ marksheetUploads })}
        />
      </Section>

      <ProfessionalCourses rows={a.professional ?? []} errors={errors} onChange={(professional) => set({ professional })} />
      <Certifications rows={a.certifications ?? []} errors={errors} onChange={(certifications) => set({ certifications })} />
    </div>
  );
}

/** Up to six matches under the institution field, as buttons (no datalist: it renders badly on phones). */
function CollegeSuggestions({ query, onPick }: { query: string; onPick: (value: string) => void }) {
  const q = query.trim();
  const hits = q.length >= 2 ? suggestColleges(q, 6).filter((c) => c.toLowerCase() !== q.toLowerCase()) : [];
  if (hits.length === 0) return null;
  return (
    <ul aria-label="Matching colleges" className="-mt-3 flex flex-wrap gap-2">
      {hits.map((c) => (
        <li key={c}>
          <button
            type="button"
            onClick={() => onPick(c)}
            className="apple-spring inline-flex min-h-11 items-center rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 sm:min-h-9"
          >
            {c}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Files already uploaded (with remove) and an upload for one more. Stores the
 * legacy shape, original file name included (INT-23).
 */
function FileList({
  rowId,
  files,
  max,
  kind,
  noun,
  onChange,
}: {
  rowId: string;
  files: CertificateUpload[];
  max: number;
  kind: "marksheet" | "certificate";
  noun: string;
  onChange: (files: CertificateUpload[]) => void;
}) {
  return (
    <div className="space-y-3">
      {files.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-ink-500">Uploaded</p>
          <ul className="mt-2 divide-y divide-ink-200/70 rounded-apple-md border border-ink-200/80 bg-white">
            {files.map((u, i) => (
              <li key={u.name} className="flex min-h-12 items-center gap-3 pl-3.5 pr-2">
                <FileText className="size-4 shrink-0 text-brand-600" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{u.originalName || `${capitalise(noun)} ${i + 1}`}</span>
                {u.size ? <span className="nums hidden shrink-0 text-xs text-ink-500 sm:inline">{Math.max(1, Math.round(u.size / 1024))} KB</span> : null}
                <RemoveButton label={`Remove ${u.originalName || `${noun} ${i + 1}`}`} onClick={() => onChange(files.filter((x) => x.name !== u.name))} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {files.length < max ? (
        <FileUpload
          // Remount after each file so the button offers another upload, not a replace.
          key={`${rowId}-${files.length}`}
          kind={kind}
          accept={FILE_TYPES}
          label={capitalise(noun)}
          noun={files.length === 0 ? noun : `another ${noun}`}
          maxBytes={1 * MB}
          hint="Image or PDF, up to 1 MB each."
          onUploaded={(r) => onChange([...files, { name: r.key, originalName: r.name, type: r.contentType, size: r.bytes }])}
        />
      ) : (
        <p className="text-xs text-ink-500">That is the most you can add. Remove one to add another.</p>
      )}
    </div>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ProfessionalCourses({
  rows,
  errors,
  onChange,
}: {
  rows: QualificationEntry[];
  errors: Record<string, string>;
  onChange: (rows: QualificationEntry[]) => void;
}) {
  const today = localToday();
  const patch = (id: string, next: Partial<QualificationEntry>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...next } : r)));
  const add = () =>
    onChange([
      ...rows,
      { id: `prof-${Date.now()}`, preset: "", name: "", level: "", status: "", issuer: "", completionDate: "", scoreType: "", score: "", credentialUrl: "", uploads: [] },
    ]);

  return (
    <Section
      title="Professional courses"
      hint="CA, CS, CMA, CFA and similar. Optional."
      action={rows.length > 0 ? <AddButton onClick={add}>Add course</AddButton> : null}
    >
      {rows.length === 0 ? (
        <EmptyEntries
          title="No professional courses"
          body="Doing CA, CS, CMA, CFA or another professional course? Add it so employers in finance and law can find you."
          action={<AddButton onClick={add}>Add a course</AddButton>}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row, i) => {
            const k = `professional.${row.id}`;
            const done = row.status === "Completed";
            return (
              <EntryCard key={row.id} title={`Course ${i + 1}`} removeLabel={`Remove course ${i + 1}`} onRemove={() => onChange(rows.filter((r) => r.id !== row.id))}>
                <Grid>
                  <SelectField
                    id={`${k}.preset`}
                    label="Course"
                    placeholder="Choose the course"
                    value={row.preset ?? ""}
                    error={errors[`${k}.preset`]}
                    options={[...PROFESSIONAL_PRESETS.map((p) => ({ value: p, label: p })), { value: "Other", label: "Other" }]}
                    onChange={(v) => patch(row.id, { preset: v, name: v === "Other" ? "" : v })}
                  />
                  {row.preset === "Other" ? (
                    <Field id={`${k}.name`} label="Course name" placeholder="e.g. ACCA" value={row.name} error={errors[`${k}.name`]} onChange={(v) => patch(row.id, { name: v })} />
                  ) : null}
                  <Field
                    id={`${k}.level`}
                    label="Level"
                    placeholder="e.g. Foundation, Intermediate, Final"
                    value={row.level ?? ""}
                    error={errors[`${k}.level`]}
                    onChange={(v) => patch(row.id, { level: v })}
                  />
                  <Field id={`${k}.issuer`} label="Institute" placeholder="e.g. ICAI" value={row.issuer} error={errors[`${k}.issuer`]} onChange={(v) => patch(row.id, { issuer: v })} />
                  <Choice
                    id={`${k}.status`}
                    label="Status"
                    value={row.status as "Completed" | "Pursuing" | ""}
                    options={STATUS}
                    error={errors[`${k}.status`]}
                    onChange={(v) => patch(row.id, { status: v, ...(v === "Pursuing" ? { completionDate: "" } : {}) })}
                  />
                  {done ? (
                    <>
                      <DateField
                        id={`${k}.completionDate`}
                        label="Completion date"
                        max={today}
                        value={row.completionDate}
                        error={errors[`${k}.completionDate`]}
                        onChange={(v) => patch(row.id, { completionDate: v })}
                      />
                      <ScoreField
                        id={`${k}.score`}
                        type={row.scoreType || "percentage"}
                        score={row.score ?? ""}
                        error={errors[`${k}.score`]}
                        onType={(t) => patch(row.id, { scoreType: t })}
                        onScore={(s) => patch(row.id, { score: s })}
                      />
                    </>
                  ) : null}
                </Grid>
                <div>
                  <Label optional>Certificate</Label>
                  <div className="mt-2">
                    <FileList rowId={row.id} files={row.uploads ?? []} max={MAX_CERTIFICATE_UPLOADS} kind="certificate" noun="certificate" onChange={(uploads) => patch(row.id, { uploads })} />
                  </div>
                </div>
              </EntryCard>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function Certifications({
  rows,
  errors,
  onChange,
}: {
  rows: QualificationEntry[];
  errors: Record<string, string>;
  onChange: (rows: QualificationEntry[]) => void;
}) {
  const today = localToday();
  const patch = (id: string, next: Partial<QualificationEntry>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...next } : r)));
  const add = () => onChange([...rows, { id: `cert-${Date.now()}`, name: "", issuer: "", startDate: "", completionDate: "", credentialUrl: "", uploads: [] }]);

  return (
    <Section
      title="Certifications"
      hint="Courses and certificates with a named issuer, like Coursera, NPTEL or AWS. Optional."
      action={rows.length > 0 ? <AddButton onClick={add}>Add certification</AddButton> : null}
    >
      {rows.length === 0 ? (
        <EmptyEntries
          title="No certifications"
          body="Finished an online course or an exam with a certificate? Add it with its dates."
          action={<AddButton onClick={add}>Add a certification</AddButton>}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row, i) => {
            const k = `certifications.${row.id}`;
            return (
              <EntryCard key={row.id} title={`Certification ${i + 1}`} removeLabel={`Remove certification ${i + 1}`} onRemove={() => onChange(rows.filter((r) => r.id !== row.id))}>
                <Grid>
                  <Field id={`${k}.name`} label="Certificate" placeholder="e.g. AWS Cloud Practitioner" value={row.name} error={errors[`${k}.name`]} onChange={(v) => patch(row.id, { name: v })} />
                  <Field id={`${k}.issuer`} label="Issued by" placeholder="e.g. Coursera, NPTEL, AWS" value={row.issuer} error={errors[`${k}.issuer`]} onChange={(v) => patch(row.id, { issuer: v })} />
                  <DateField id={`${k}.startDate`} label="Start date" max={today} value={row.startDate ?? ""} error={errors[`${k}.startDate`]} onChange={(v) => patch(row.id, { startDate: v })} />
                  <DateField
                    id={`${k}.completionDate`}
                    label="End date"
                    min={row.startDate || undefined}
                    max={today}
                    value={row.completionDate}
                    error={errors[`${k}.completionDate`]}
                    onChange={(v) => patch(row.id, { completionDate: v })}
                  />
                </Grid>
                <div>
                  <Label optional>Certificate</Label>
                  <div className="mt-2">
                    <FileList rowId={row.id} files={row.uploads ?? []} max={MAX_CERTIFICATE_UPLOADS} kind="certificate" noun="certificate" onChange={(uploads) => patch(row.id, { uploads })} />
                  </div>
                </div>
              </EntryCard>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/** Score type and score in one field cell. */
function ScoreField({
  id,
  type,
  score,
  error,
  onType,
  onScore,
}: {
  id: string;
  type: ScoreType;
  score: string;
  error?: string;
  onType: (type: ScoreType) => void;
  onScore: (score: string) => void;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>Score</Label>
      <div className="mt-2 grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-2.5">
        <Select id={`${id}Type`} ariaLabel="Score type" value={type} onChange={(v) => onType(v as ScoreType)} options={SCORE_TYPES} />
        <input
          id={id}
          name={id}
          inputMode="decimal"
          placeholder={type === "cgpa" ? "e.g. 8.4" : "e.g. 62"}
          value={score}
          onChange={(e) => onScore(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={controlClass(error, "nums")}
        />
      </div>
      <FieldNote id={id} error={error} />
    </div>
  );
}
