"use client";

/**
 * "Add to compare" on a candidate's profile (EMB-12, legacy "Add to Compare /
 * In Compare"). The picks live in the same cookie the candidates page writes
 * (ft_emp_compare, see lib/employer-selection), so the candidate shows up
 * ticked there and on the compare page. Picks are kept per project, so this
 * one goes to `projectId`, and the compare link opens that project's picks.
 */

import { useState } from "react";
import Link from "next/link";
import { Check, Scale } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { readComparePicks, saveComparePicks } from "@/components/employer/remember-selection";
import { getPicks, setPicks } from "@/lib/candidate-picks-store";
import { cn } from "@/lib/utils";

const MAX = 4;

export function CompareToggle({
  employerId,
  internId,
  projectId,
  picked: initial,
  disabledReason,
}: {
  employerId: string;
  internId: string;
  /** The project these picks belong to; null when the employer has no open project. */
  projectId: string | null;
  /** This project's compare picks, read server-side from the cookie. */
  picked: string[];
  /** Why this candidate can't be compared (hired, full-time offer), if so. */
  disabledReason?: string | null;
}) {
  // This page's picks can be an old snapshot (Back, the router cache): the cookie, written on every pick anywhere, wins.
  // On a fresh load the server read the same cookie, so the first render matches.
  const [picked, setPicked] = useState(() => (typeof window !== "undefined" && projectId ? readComparePicks(employerId, projectId) : initial));
  const inCompare = picked.includes(internId);
  const full = !inCompare && picked.length >= MAX;

  function save(change: (current: string[]) => string[]) {
    // Applied to the picks as saved now, not as this page last saw them, so a pick made in another page or tab stays.
    const next = change(projectId ? readComparePicks(employerId, projectId) : picked).slice(0, MAX);
    setPicked(next);
    if (projectId) saveComparePicks(employerId, projectId, next);
    // Nothing else on this page reads the picks from the server, and a Candidates list kept in the browser's cache follows the store.
    if (projectId && getPicks().project === projectId) setPicks(next);
  }

  if (disabledReason) {
    return (
      <button type="button" disabled className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })} title={disabledReason}>
        <Scale className="size-4" aria-hidden />
        {disabledReason}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        disabled={full || !projectId}
        aria-pressed={inCompare}
        title={full ? "Compare holds four candidates. Remove one first." : undefined}
        onClick={() => save((current) => (inCompare ? current.filter((id) => id !== internId) : current.includes(internId) ? current : [...current, internId]))}
        className={buttonClass({ variant: "outline", size: "sm", className: cn("min-h-11", inCompare && "bg-brand-50") })}
      >
        {inCompare ? <Check className="size-4" aria-hidden /> : <Scale className="size-4" aria-hidden />}
        {inCompare ? "In compare" : full ? "Compare full (4)" : "Add to compare"}
      </button>
      {picked.length >= 2 && inCompare ? (
        <Link href={`/employer/compare${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
          Compare {picked.length} now
        </Link>
      ) : null}
    </span>
  );
}
