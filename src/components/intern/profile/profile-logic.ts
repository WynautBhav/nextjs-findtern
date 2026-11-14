/**
 * Pure display rules for the intern profile page, kept out of the components so they can be tested.
 * Nothing here reads or changes what is stored; it only decides how stored values are worded.
 */
import { maskTail } from "../../../lib/admin/identity-mask.ts";
import { completionWhy } from "../completion-why.ts";

export type Completion = {
  items: { id: string; label: string; done: boolean; href: string }[];
  done: number;
  total: number;
  complete: boolean;
};

/** 0 to 100, whole number. An empty list is 0, never NaN. */
export function completionPct(c: Pick<Completion, "done" | "total">): number {
  if (!c.total) return 0;
  return Math.max(0, Math.min(100, Math.round((c.done / c.total) * 100)));
}

/**
 * The one thing to do next: the first step still open, in the order the form asks for them, with the
 * reason it matters (the same words the dashboard uses). Null once everything is done.
 */
export function nextAction(c: Completion): {
  id: string;
  label: string;
  why: string;
  href: string;
  remaining: number;
} | null {
  const open = c.items.filter((i) => !i.done);
  const first = open[0];
  if (!first) return null;
  return {
    id: first.id,
    label: first.label,
    why: completionWhy(first.id).why,
    href: first.href,
    remaining: open.length,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-06-02" or "2025-06" → "Jun 2025". Anything else is shown as stored; blank stays blank. */
export function monthYear(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(v);
  if (!m) return v;
  const name = MONTHS[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : v;
}

const isPresent = (v: string) => v.trim().toLowerCase() === "present";

/** "Jun 2025 – Aug 2025", "Jan 2025 – Present". One end missing shows just the other; none gives "". */
export function dateRange(from: string | null | undefined, to: string | null | undefined, current = false): string {
  const start = monthYear(from);
  const end = current || isPresent(to ?? "") ? "Present" : monthYear(to);
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  return end === "Present" ? "Present" : end;
}

function monthIndex(value: string): number | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim());
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}

/** "3 mos", "1 yr 2 mos", "1 mo": months between the ends, both months counted. "" when a date can't be read. */
export function durationLabel(
  from: string | null | undefined,
  to: string | null | undefined,
  current = false,
  now: Date = new Date(),
): string {
  const a = monthIndex(from ?? "");
  const end = current || isPresent(to ?? "") ? now.getFullYear() * 12 + now.getMonth() : monthIndex(to ?? "");
  if (a === null || end === null || end < a) return "";
  const months = end - a + 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} yr${years > 1 ? "s" : ""}` : "";
  const mo = rest ? `${rest} mo${rest > 1 ? "s" : ""}` : "";
  return [y, mo].filter(Boolean).join(" ");
}

type Exp = { type: string; company: string; role: string };

/** Entries with nothing to show are dropped; projects are listed apart from jobs, internships and freelance work. */
export function splitExperience<T extends Exp>(list: T[]): { work: T[]; projects: T[] } {
  const shown = list.filter((e) => e.company || e.role);
  return {
    work: shown.filter((e) => e.type !== "Project"),
    projects: shown.filter((e) => e.type === "Project"),
  };
}

/** An identity number as the page may show it: the last four only, never the number. */
export function maskedId(value: string | null | undefined): string | null {
  const masked = maskTail(value ?? "");
  return masked || null;
}

/** "B.Tech, Computer Science" from degree and branch; "" when neither is set. */
export function degreeLine(a: { degree?: string; branch?: string }): string {
  return [a.degree, a.branch].filter(Boolean).join(", ");
}

/** "Completed" and "Pursuing" as stored lower or upper case. */
export function statusLabel(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : "";
}

/** The score as "CGPA 8.7 / 10" or "82%"; "" when no score is stored. */
export function scoreLine(a: { cgpa?: string; scoreType?: string }): string {
  const v = (a.cgpa ?? "").trim();
  if (!v) return "";
  return a.scoreType === "percentage" ? `${v.replace(/%$/, "")}%` : `CGPA ${v} / 10`;
}

/** Case-insensitive de-duplication, first spelling wins ("Bengaluru, bengaluru" → "Bengaluru"). */
export function uniqueCi(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((v) => {
    const k = v.trim().toLowerCase();
    return k && !seen.has(k) && (seen.add(k), true);
  });
}

/** Work modes are stored as the implied set (onsite ⇒ hybrid + remote); say it the same way. */
export function workModeLine(modes: string[]): string | null {
  const set = new Set(modes.map((m) => m.toLowerCase()));
  if (set.has("onsite")) return "On-site, and open to hybrid or remote";
  if (set.has("hybrid")) return "Hybrid, and open to remote";
  if (set.has("remote")) return "Remote";
  return null;
}

export type DocRow = {
  id: "photo" | "pan" | "aadhaar";
  label: string;
  /** The last four of the number, a short fact, or "" . Never the full number. */
  detail: string;
  /** ok: all there. missing: the profile needs it. optional: not asked for, shown as a fact. */
  state: "ok" | "missing" | "optional";
  stateLabel: string;
};

/**
 * What is on file, as rows. PAN needs its number and its card image (the profile's own rule); Aadhaar needs
 * its number and its image is optional. This reads whether a file exists, not whether anyone has reviewed it.
 */
export function documentRows(d: {
  photo: boolean;
  panNumber?: string | null;
  panImage: boolean;
  aadhaarNumber?: string | null;
  aadhaarImage: boolean;
}): DocRow[] {
  const pan = maskedId(d.panNumber);
  const aadhaar = maskedId(d.aadhaarNumber);
  const panParts = [pan ?? "Number not added", d.panImage ? "card image uploaded" : "card image missing"];
  const aadhaarParts = [aadhaar ?? "Number not added", d.aadhaarImage ? "image uploaded" : "no image"];
  return [
    {
      id: "photo",
      label: "Profile photo",
      detail: d.photo ? "Uploaded" : "Not uploaded",
      state: d.photo ? "ok" : "missing",
      stateLabel: d.photo ? "On file" : "Missing",
    },
    {
      id: "pan",
      label: "PAN",
      detail: panParts.join(", "),
      state: pan && d.panImage ? "ok" : "missing",
      stateLabel: pan && d.panImage ? "On file" : "Incomplete",
    },
    {
      id: "aadhaar",
      label: "Aadhaar",
      detail: aadhaarParts.join(", "),
      state: aadhaar ? "ok" : "missing",
      stateLabel: aadhaar ? "On file" : "Incomplete",
    },
  ];
}
