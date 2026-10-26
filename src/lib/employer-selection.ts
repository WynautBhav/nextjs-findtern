/**
 * What an employer last picked on the candidates page - the project and the
 * candidates ticked for Compare - kept across pages (bug sheet 26 Oct: "selected
 * project got removed when we go on another page", "compare button is not
 * working" from the sidebar). Legacy kept both in localStorage
 * (employer-compare.tsx:80, 263); a cookie does the same job but is readable
 * by the server pages that render the list.
 *
 * Values are prefixed with the employer id so a second account on the same
 * browser never inherits the first one's picks. Nothing here is trusted: the
 * pages check the project belongs to the employer and the candidates are
 * visible to them.
 */

import { cookies } from "next/headers";

export const PROJECT_COOKIE = "ft_emp_project";
export const COMPARE_COOKIE = "ft_emp_compare";
/** Compare shows at most four columns. */
export const MAX_COMPARE = 4;

export function parseIds(raw: string | string[] | undefined | null): string[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return Array.from(
    new Set(
      joined
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_COMPARE);
}

/** This employer's remembered project id and compare ids, if any. */
export async function rememberedSelection(employerId: string): Promise<{ project: string | null; compare: string[] }> {
  const jar = await cookies();
  const own = (name: string) => {
    const value = jar.get(name)?.value ?? "";
    const prefix = `${employerId}:`;
    return value.startsWith(prefix) ? value.slice(prefix.length) : "";
  };
  return { project: own(PROJECT_COOKIE) || null, compare: parseIds(own(COMPARE_COOKIE)) };
}
