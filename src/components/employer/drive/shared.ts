import type { Tone } from "@/components/app/primitives";

export type DriveCandidate = {
  id: string;
  /** Initials until this company hires them (displayNameOf). */
  name: string;
  initials: string;
  year: number | null;
  branch: string | null;
  /** Only sent for full-time drives. */
  cgpa: number | null;
  score: number | null;
  skills: string[];
  shortlisted: boolean;
  /** Findtern open in the last ~75 s, so a "call now" will be seen. */
  online: boolean;
};

export const CALL_STATUS: Record<string, { tone: Tone; label: string }> = {
  requested: { tone: "waiting", label: "Waiting for reply" },
  accepted: { tone: "live", label: "Accepted" },
  declined: { tone: "closed", label: "Declined" },
  expired: { tone: "closed", label: "No reply" },
  cancelled: { tone: "closed", label: "Cancelled" },
};

export const DELAYS = [
  { minutes: 0, label: "Now" },
  { minutes: 5, label: "In 5 minutes" },
  { minutes: 10, label: "In 10 minutes" },
] as const;

export const YEAR_LABEL = (y: number) => `${y}${["st", "nd", "rd"][y - 1] ?? "th"} year`;

export function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );
}


export const SKILLS_SHOWN = 8;
export const SKILL_CHIP = "rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700";
