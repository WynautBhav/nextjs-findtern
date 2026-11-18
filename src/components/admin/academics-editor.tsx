"use client";

/**
 * Edit a candidate's education: level, degree, branch, institution, status, years, score type and score.
 *
 * Employers read the score on the candidate card and it is what a "completed with a good CGPA" filter keys on, so a
 * wrong or missing one costs the candidate shortlists. The rules are the intern's own Academics step (shared
 * `academicsProblems`), checked here for fast feedback and again on the server, which is the authority. Only the
 * fields that changed are sent. Without the Edit candidates permission the same details show as text, with the
 * reason, instead of a form that would only fail.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { DEGREES_BY_LEVEL, levelHasDegreeList } from "@/lib/onboarding";
import { EDIT_FIELDS, LEVEL_LABELS, academicsProblems, firstProblem, type AcademicsEdit, type AcademicsValues, type EditField } from "@/lib/admin/academics-edit";

const input =
  "mt-1 h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle focus-visible:border-brand-600 aria-[invalid=true]:border-danger";

export function AcademicsEditor({ internId, initial }: { internId: string; initial: AcademicsValues }) {
  const router = useRouter();
  const [saved, setSaved] = useState<AcademicsValues>(initial);
  const [values, setValues] = useState<AcademicsValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // A stored level outside the list (High School, an old spelling) stays selectable so the box never lies.
  const levels = LEVEL_LABELS.includes(values.qualificationLevel) || !values.qualificationLevel ? LEVEL_LABELS : [...LEVEL_LABELS, values.qualificationLevel];
  const phd = values.qualificationLevel === "Ph.D";
  const edit: AcademicsEdit = {};
  for (const f of EDIT_FIELDS) if (values[f] !== saved[f]) (edit as Record<string, string>)[f] = values[f];
  const dirty = Object.keys(edit).length > 0;
  const problems = academicsProblems(saved, edit);

  function set(patch: Partial<AcademicsValues>) {
    setValues((v) => ({ ...v, ...patch }));
    setError(null);
    setDone(false);
  }

  async function save() {
    if (firstProblem(problems)) return; // the button is disabled while a field is wrong; its message is under the field
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/interns/${encodeURIComponent(internId)}/academics`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edit),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the education details.");
      setSaved(values);
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the education details.");
    } finally {
      setBusy(false);
    }
  }

  const err = (f: EditField) => (dirty && edit[f] !== undefined ? problems[f] : undefined);
  const aria = (f: EditField) => ({ "aria-invalid": err(f) ? true : undefined, "aria-describedby": err(f) ? `acad-${f}-err` : undefined });
  const msg = (f: EditField) =>
    err(f) ? (
      <p id={`acad-${f}-err`} role="alert" className="mt-1 text-xs font-medium text-danger">
        {err(f)}
      </p>
    ) : null;
  const label = "block text-sm font-medium text-ink-700";

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="acad-level" className={label}>Qualification level</label>
          <select id="acad-level" value={values.qualificationLevel} onChange={(e) => set({ qualificationLevel: e.target.value, ...(e.target.value === "Ph.D" ? { score: "", scoreType: "" as const } : {}) })} className={input} {...aria("qualificationLevel")}>
            <option value="">Choose</option>
            {levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {msg("qualificationLevel")}
        </div>
        <div>
          <label htmlFor="acad-degree" className={label}>{phd ? "Ph.D subject" : values.qualificationLevel === "Diploma" ? "Diploma" : "Degree"}</label>
          <input
            id="acad-degree"
            value={values.degree}
            onChange={(e) => set({ degree: e.target.value })}
            list={levelHasDegreeList(values.qualificationLevel) ? "acad-degree-options" : undefined}
            placeholder={phd ? "e.g. Computational Biology" : "e.g. B.Tech"}
            className={input}
            {...aria("degree")}
          />
          {levelHasDegreeList(values.qualificationLevel) ? (
            <datalist id="acad-degree-options">{(DEGREES_BY_LEVEL[values.qualificationLevel] ?? []).map((d) => <option key={d} value={d} />)}</datalist>
          ) : null}
          {msg("degree")}
        </div>
        <div>
          <label htmlFor="acad-branch" className={label}>Branch or specialization</label>
          <input id="acad-branch" value={values.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="e.g. Computer Science" className={input} />
        </div>
        <div>
          <label htmlFor="acad-institution" className={label}>Institution</label>
          <input id="acad-institution" value={values.institution} onChange={(e) => set({ institution: e.target.value })} className={input} {...aria("institution")} />
          {msg("institution")}
        </div>
        <div>
          <label htmlFor="acad-status" className={label}>Status</label>
          <select id="acad-status" value={values.status} onChange={(e) => set({ status: e.target.value })} className={input} {...aria("status")}>
            <option value="">Choose</option>
            <option value="Completed">Completed</option>
            <option value="Pursuing">Pursuing</option>
          </select>
          {msg("status")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="acad-start" className={label}>Start year</label>
            <input id="acad-start" value={values.startYear} onChange={(e) => set({ startYear: e.target.value })} inputMode="numeric" maxLength={4} placeholder="2022" className={cn(input, "nums")} {...aria("startYear")} />
            {msg("startYear")}
          </div>
          <div>
            <label htmlFor="acad-end" className={label}>End year</label>
            <input id="acad-end" value={values.yearOfGraduation} onChange={(e) => set({ yearOfGraduation: e.target.value })} inputMode="numeric" maxLength={4} placeholder="2026" className={cn(input, "nums")} {...aria("yearOfGraduation")} />
            {msg("yearOfGraduation")}
          </div>
        </div>
        <div>
          <label htmlFor="acad-score-type" className={label}>Score type</label>
          <select id="acad-score-type" value={values.scoreType} onChange={(e) => set({ scoreType: e.target.value as AcademicsValues["scoreType"] })} disabled={phd} className={input} {...aria("scoreType")}>
            <option value="">None</option>
            <option value="cgpa">CGPA (out of 10)</option>
            <option value="percentage">Percentage</option>
          </select>
          {msg("scoreType")}
        </div>
        <div>
          <label htmlFor="acad-score" className={label}>{values.scoreType === "percentage" ? "Percentage" : "CGPA"}</label>
          <input
            id="acad-score"
            value={phd ? "" : values.score}
            onChange={(e) => set({ score: e.target.value })}
            disabled={phd}
            inputMode="decimal"
            placeholder={values.scoreType === "percentage" ? "0–100" : "0–10"}
            className={cn(input, "nums")}
            {...aria("score")}
          />
          {msg("score")}
        </div>
      </div>
      {phd ? <p className="mt-2 text-xs text-text-subtle">Ph.D profiles carry no score. Choose another qualification level to add one.</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy || !dirty || firstProblem(problems) !== null} className={buttonClass({ variant: "primary", size: "sm" })}>
          {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Save education
        </button>
      </div>
      <p className="mt-2 text-xs text-text-subtle">Changes are logged.</p>
      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      {done ? <p role="status" className="mt-2 text-sm text-brand-700">Saved. The candidate and employers now see these details.</p> : null}
    </div>
  );
}

