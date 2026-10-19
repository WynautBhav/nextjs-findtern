"use client";

/**
 * Record the four AI-interview ratings for a candidate.
 *
 * Employers see these on the candidate card, in compare, and on the intern's
 * detail page, and the mean of the four is the Findtern Score that the pricing
 * bands are built on - so an admin typing these numbers is setting a price, not
 * writing a note. The endpoint recomputes the score server-side; this shows what
 * it came out as so the number is never a surprise on the employer's screen.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

const AXES = [
  { key: "communication", label: "Communication" },
  { key: "coding", label: "Coding" },
  { key: "aptitude", label: "Aptitude" },
  { key: "interview", label: "AI interview" },
] as const;

type Axis = (typeof AXES)[number]["key"];

export function RatingsEditor({
  internId,
  ratings,
  score,
  initialFeedbackLink,
  initialRecordingLink,
}: {
  internId: string;
  ratings: Partial<Record<Axis, number>>;
  score: number | null;
  initialFeedbackLink?: string | null;
  initialRecordingLink?: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<Axis, string>>(() => ({
    communication: ratings.communication?.toString() ?? "",
    coding: ratings.coding?.toString() ?? "",
    aptitude: ratings.aptitude?.toString() ?? "",
    interview: ratings.interview?.toString() ?? "",
  }));
  const [feedbackLink, setFeedbackLink] = useState(initialFeedbackLink ?? "");
  const [recordingLink, setRecordingLink] = useState(initialRecordingLink ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  async function save() {
    const payload: Record<string, unknown> = {};
    for (const axis of AXES) {
      const raw = values[axis.key].trim();
      // An emptied box clears that rating (legacy behaviour).
      if (!raw) {
        payload[axis.key] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 10) {
        setError(`${axis.label} must be a number between 0 and 10.`);
        return;
      }
      payload[axis.key] = n;
    }
    payload.aiFeedbackLink = feedbackLink.trim() || null;
    payload.aiRecordingLink = recordingLink.trim() || null;

    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/interns/${encodeURIComponent(internId)}/ratings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the ratings.");
      setSaved(typeof data.findternScore === "number" ? data.findternScore : null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the ratings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-ink-100 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
          AI interview ratings & Incruiter reports
        </p>
        <p className="text-2xs text-ink-500">
          Findtern Score{" "}
          <span className="font-semibold tabular-nums text-ink-800">
            {saved !== null ? saved.toFixed(1) : score !== null ? score.toFixed(1) : "-"}
          </span>
          {saved !== null ? " (just recalculated)" : ""}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {AXES.map((axis) => (
          <div key={axis.key}>
            <label htmlFor={`rating-${axis.key}`} className="block text-xs font-medium text-ink-700">
              {axis.label}
            </label>
            <input
              id={`rating-${axis.key}`}
              value={values[axis.key]}
              onChange={(e) => {
                setValues((v) => ({ ...v, [axis.key]: e.target.value }));
                setError(null);
                setSaved(null);
              }}
              inputMode="decimal"
              placeholder="0–10"
              className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus-visible:border-brand-600"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ai-feedback-link" className="block text-xs font-medium text-ink-700">
            Incruiter Report Link / PDF URL
          </label>
          <input
            id="ai-feedback-link"
            value={feedbackLink}
            onChange={(e) => {
              setFeedbackLink(e.target.value);
              setError(null);
              setSaved(null);
            }}
            placeholder="https://incruiter.com/reports/... or PDF URL"
            className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus-visible:border-brand-600"
          />
        </div>
        <div>
          <label htmlFor="ai-recording-link" className="block text-xs font-medium text-ink-700">
            Incruiter Interview Recording URL
          </label>
          <input
            id="ai-recording-link"
            value={recordingLink}
            onChange={(e) => {
              setRecordingLink(e.target.value);
              setError(null);
              setSaved(null);
            }}
            placeholder="https://incruiter.com/recording/..."
            className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus-visible:border-brand-600"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        Save ratings & links
      </button>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      {saved !== null ? (
        <p className="mt-2 text-xs text-brand-700">
          Saved. Employers filtering by score and viewing dossier will see the updated report.
        </p>
      ) : null}
    </div>
  );
}