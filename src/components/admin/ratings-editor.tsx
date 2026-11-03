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

import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { RATING_AXES, buildRatingsPayload, clearScorePayload, type RatingAxis } from "@/lib/ratings-payload";

const AXES = RATING_AXES;
type Axis = RatingAxis;

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
  const { ask, dialog } = useConfirm();
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

  async function send(payload: Record<string, unknown>) {
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

  async function save() {
    // Only what the admin changed is sent: saving just a link must not touch (or clear) the ratings and an imported score.
    const built = buildRatingsPayload({ values, ratings, feedbackLink, recordingLink, initialFeedbackLink, initialRecordingLink });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    await send(built.payload);
  }

  async function clearScore() {
    const ok = await ask({
      title: "Clear this Findtern Score?",
      body: "This removes all four ratings and the score employers see and price against. Re-import or re-enter the ratings to bring it back.",
      confirmLabel: "Clear score",
    });
    if (!ok) return;
    setValues({ communication: "", coding: "", aptitude: "", interview: "" });
    await send(clearScorePayload());
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink-700">AI interview ratings and Incruiter report</p>
        <p className="text-sm text-ink-600">
          Findtern Score{" "}
          <span className="nums font-semibold text-ink-900">
            {saved !== null ? saved.toFixed(1) : score !== null ? score.toFixed(1) : "-"}
          </span>
          {saved !== null ? " (just recalculated)" : ""}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {AXES.map((axis) => (
          <div key={axis.key}>
            <label htmlFor={`rating-${axis.key}`} className="block text-sm font-medium text-ink-700">
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
              className="nums mt-1 h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle focus-visible:border-brand-600"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ai-feedback-link" className="block text-sm font-medium text-ink-700">
            Incruiter report link (PDF URL)
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
            className="mt-1 h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle focus-visible:border-brand-600"
          />
        </div>
        <div>
          <label htmlFor="ai-recording-link" className="block text-sm font-medium text-ink-700">
            Incruiter recording link
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
            className="mt-1 h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle focus-visible:border-brand-600"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className={buttonClass({ variant: "primary", size: "sm" })}>
          {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Save ratings and links
        </button>
        {score !== null ? (
          <button type="button" onClick={clearScore} disabled={busy} className={buttonClass({ variant: "outline", size: "sm" })}>
            Clear score
          </button>
        ) : null}
      </div>

      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      {saved !== null ? (
        <p role="status" className="mt-2 text-sm text-brand-700">
          Saved. Employers filtering by score and viewing dossier will see the updated report.
        </p>
      ) : null}
      {dialog}
    </div>
  );
}
