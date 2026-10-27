"use client";

/**
 * "Add to compare" on a candidate's profile (EMB-12, legacy "Add to Compare /
 * In Compare"). The picks live in the same cookie the candidates page writes
 * (ft_emp_compare, see lib/employer-selection), so the candidate shows up
 * ticked there and on the compare page.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Scale } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

const MAX = 4;
const MAX_AGE = 60 * 60 * 24 * 30;

export function CompareToggle({
  employerId,
  internId,
  picked: initial,
  disabledReason,
}: {
  employerId: string;
  internId: string;
  /** Current compare picks, read server-side from the cookie. */
  picked: string[];
  /** Why this candidate can't be compared (hired, full-time offer), if so. */
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState(initial);
  const inCompare = picked.includes(internId);
  const full = !inCompare && picked.length >= MAX;

  function save(next: string[]) {
    setPicked(next);
    document.cookie = next.length
      ? `ft_emp_compare=${encodeURIComponent(`${employerId}:${next.join(",")}`)}; path=/employer; max-age=${MAX_AGE}; samesite=lax`
      : `ft_emp_compare=; path=/employer; max-age=0; samesite=lax`;
    router.refresh();
  }

  if (disabledReason) {
    return (
      <span className={buttonClass({ variant: "light", size: "md", className: "pointer-events-none opacity-70" })} aria-disabled="true" title={disabledReason}>
        <Scale className="size-4" aria-hidden />
        {disabledReason}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        disabled={full}
        aria-pressed={inCompare}
        title={full ? "Compare holds four candidates. Remove one first." : undefined}
        onClick={() => save(inCompare ? picked.filter((id) => id !== internId) : [...picked, internId])}
        className={buttonClass({ variant: "outline", size: "md", className: inCompare ? "bg-brand-50" : undefined })}
      >
        {inCompare ? <Check className="size-4" aria-hidden /> : <Scale className="size-4" aria-hidden />}
        {inCompare ? "In compare" : full ? "Compare full (4)" : "Add to compare"}
      </button>
      {picked.length >= 2 && inCompare ? (
        <Link href="/employer/compare" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
          Compare {picked.length} now
        </Link>
      ) : null}
    </span>
  );
}
