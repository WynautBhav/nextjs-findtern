import type { Tone } from "@/components/app/primitives";

/**
 * Pill tone for a timesheet day status, shared by the editor and the
 * read-only view. A stored legacy-incompatible "Leave" reads as time away.
 * Server-safe (no client directive).
 */
export function dayTone(status: string): Tone {
  switch (status) {
    case "Present":
      return "live";
    case "Absent":
    case "Leave":
      return "closed";
    case "Fixed off":
      return "neutral";
    case "Holiday":
      return "new";
    default:
      return "waiting";
  }
}
