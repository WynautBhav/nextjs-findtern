import { z } from "zod";

import { startDateProblem } from "./business-days.ts";

/**
 * The terms of a full-time offer, defined once: the send route (api/employer/[id]/full-time-offer) and the edit branch
 * of api/proposals/[id] both read them, so what can be sent is exactly what can be edited.
 */
const fields = {
  jobTitle: z.string().trim().min(2).max(120),
  jobMode: z.enum(["remote", "hybrid", "onsite"]),
  jobLocationCity: z.string().trim().max(80),
  jobLocationState: z.string().trim().max(80),
  timezone: z.string().min(1),
  shiftFrom: z.string().min(1),
  shiftTo: z.string().min(1),
  annualCtc: z.number().positive().max(100_000_000),
  /** Optional joining date. When sent it is held to the hiring start rule (a weekday, two days after sending). Stored inside fullTimeOffer, so it never lapses the offer. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date.").optional(),
};

/** Sending: the place and zone default when left out. */
export const fullTimeTerms = {
  ...fields,
  jobLocationCity: fields.jobLocationCity.default(""),
  jobLocationState: fields.jobLocationState.default(""),
  timezone: fields.timezone.default("Asia/Kolkata"),
};

/** Editing: any of the terms (left out stays as it was; a default must not overwrite it), and optionally a new letter. */
export const fullTimeEdit = z.object({ ...fields, offerLetterKey: z.string().min(10) }).partial().strict();

/** Why these terms can't go out (the first problem, in words for the employer), or null. `checkDate` is false for a date left as it was. */
export function fullTimeTermsProblem(
  t: { jobMode: string; jobLocationCity: string; jobLocationState: string; startDate?: string },
  now: Date,
  checkDate = true,
): string | null {
  const date = checkDate && t.startDate !== undefined ? startDateProblem(t.startDate, now) : null;
  if (date) return date;
  if (t.jobMode !== "remote" && (!t.jobLocationCity || !t.jobLocationState)) return "City and state are needed for onsite or hybrid roles.";
  return null;
}

/**
 * The offer letter is a PDF, whatever the upload route accepted for other kinds. A key is `<subject>.<random>.<ext>` and the
 * extension is set from the bytes the upload route sniffed (store.ts), so ".pdf" means the file really is one. The subject
 * must be the employer's own, so a letter can't be borrowed from another account.
 */
export function offerLetterKeyProblem(key: string, employerId: string): string | null {
  if (!key.startsWith(employerId.replace(/[^a-z0-9_-]/gi, "").slice(0, 32))) return "Upload the offer letter again.";
  if (!key.toLowerCase().endsWith(".pdf")) return "The offer letter must be a PDF.";
  return null;
}
