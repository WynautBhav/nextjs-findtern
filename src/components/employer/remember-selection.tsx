"use client";

/**
 * Writes the employer's current project and compare picks to cookies, so the
 * next visit to the candidates or compare page starts where they left off
 * (see lib/employer-selection). Renders nothing.
 */

import { useEffect } from "react";

const MAX_AGE = 60 * 60 * 24 * 30;

function write(name: string, value: string | null) {
  document.cookie = value
    ? `${name}=${encodeURIComponent(value)}; path=/employer; max-age=${MAX_AGE}; samesite=lax`
    : `${name}=; path=/employer; max-age=0; samesite=lax`;
}

export function RememberSelection({
  employerId,
  project,
  compare,
}: {
  employerId: string;
  /** Undefined leaves the stored project as it is. */
  project?: string | null;
  compare?: string[];
}) {
  const compareKey = compare?.join(",");
  useEffect(() => {
    // Names match PROJECT_COOKIE / COMPARE_COOKIE in lib/employer-selection,
    // which is server-only (next/headers) and can't be imported here.
    if (project !== undefined) write("ft_emp_project", project ? `${employerId}:${project}` : null);
    if (compareKey !== undefined) write("ft_emp_compare", compareKey ? `${employerId}:${compareKey}` : null);
  }, [employerId, project, compareKey]);
  return null;
}
