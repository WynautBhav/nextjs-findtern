import { z } from "zod";

/** Dates outside this window are typos (and years past Postgres' timestamp range answer a 500). */
const MIN_DATE = Date.UTC(2000, 0, 1);
const MAX_DATE = Date.UTC(2101, 0, 1);
const sensibleDate = z.coerce
  .date()
  .refine((d) => d.getTime() >= MIN_DATE && d.getTime() < MAX_DATE, { message: "Pick a date between 2000 and 2100" });

/** Drive builder payload, shared by create and update. */
export const driveInput = z
  .object({
    title: z.string().trim().min(3, "Give the drive a name").max(120),
    kind: z.enum(["internship", "full_time"]),
    description: z.string().trim().max(2000).optional().default(""),
    startsAt: sensibleDate,
    endsAt: sensibleDate,
    eligibility: z
      .object({
        minCgpa: z.number().min(0).max(10).optional(),
        minScore: z.number().min(0).max(10).optional(),
        years: z.array(z.number().int().min(1).max(5)).max(5).optional(),
        branches: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
      })
      .default({}),
    includeUserIds: z.array(z.string().min(1)).max(2000).default([]),
    excludeUserIds: z.array(z.string().min(1)).max(2000).default([]),
    invitedEmployers: z
      .array(z.object({ company: z.string().trim().min(1, "Name the company").max(120), email: z.string().trim().toLowerCase().email("Check the company email").max(200) }))
      .max(50, "Invite at most 50 companies per drive")
      // The same address typed twice (emails are already lowercased above) is one company: keep the first.
      .transform((list) => list.filter((i, at) => list.findIndex((o) => o.email === i.email) === at))
      // Optional, no default: an edit that leaves it out keeps the saved list (the column defaults to []).
      .optional(),
  })
  .refine((d) => d.endsAt.getTime() > d.startsAt.getTime(), { message: "The drive must end after it starts", path: ["endsAt"] })
  .refine((d) => d.endsAt.getTime() - d.startsAt.getTime() <= 60 * 24 * 3600_000, {
    message: "A drive can run for at most 60 days",
    path: ["endsAt"],
  });

export type DriveInput = z.infer<typeof driveInput>;

export function driveUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/drive/${token}`;
}

/**
 * The share link for a token that exists only in this response (it is stored hashed). Called
 * after the drive or the new token is committed, so a missing PUBLIC_ORIGIN must not 500: it
 * answers the site-relative path and the browser prefixes its own origin.
 */
export function driveShareUrl(origin: string | null, token: string): string {
  return origin === null ? `/drive/${token}` : driveUrl(origin, token);
}
