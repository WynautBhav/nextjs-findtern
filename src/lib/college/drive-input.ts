import { z } from "zod";

import { invitePhone } from "./invite-import.ts";

/** Dates outside this window are typos (and years past Postgres' timestamp range answer a 500). */
const MIN_DATE = Date.UTC(2000, 0, 1);
const MAX_DATE = Date.UTC(2101, 0, 1);
const sensibleDate = z.coerce
  .date()
  .refine((d) => d.getTime() >= MIN_DATE && d.getTime() < MAX_DATE, { message: "Pick a date between 2000 and 2100" });

/** Who a drive is for. A label only: it never changes which students are eligible. "any" is every drive made before it existed. */
export const AUDIENCES = ["tech", "non_tech", "any"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Control characters and line breaks never belong in a name or company; they would break the invite email's lines. */
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

const contactName = z.string().max(120).transform((v) => v.replace(CONTROL, " ").replace(/\s+/g, " ").trim());

/** One invited employer. name and phone are optional; an empty string means "cleared" (the route drops it, see prepareInvited). */
export const invitedEmployer = z.object({
  company: z.string().max(120).transform((v) => v.replace(CONTROL, " ").replace(/\s+/g, " ").trim()).pipe(z.string().min(1, "Name the company")),
  email: z.string().trim().toLowerCase().email("Check the company email").max(200),
  name: contactName.optional(),
  phone: z
    .string()
    .max(40)
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const r = invitePhone(v);
      if (r.error) {
        ctx.addIssue({ code: "custom", message: r.error });
        return z.NEVER;
      }
      return r.phone ?? "";
    }),
});

/** Drive builder payload, shared by create and update. */
export const driveInput = z
  .object({
    title: z.string().trim().min(3, "Give the drive a name").max(120),
    // One kind of drive since 23 Nov (employers pick Interns or Full-time inside it); an older client may still send one.
    kind: z.enum(["internship", "full_time"]).optional(),
    // Tech / Non-tech label. Optional so an edit that leaves it out keeps the saved one; a new drive must pick one (the create route checks).
    audience: z.enum(AUDIENCES).optional(),
    description: z.string().trim().max(2000).optional().default(""),
    startsAt: sensibleDate,
    endsAt: sensibleDate,
    eligibility: z
      .object({
        minCgpa: z.number().min(0).max(10).optional(),
        minScore: z.number().min(0).max(10).optional(),
        years: z.array(z.number().int().min(1).max(5)).max(5).optional(),
        branches: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
        degrees: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
      })
      .default({}),
    includeUserIds: z.array(z.string().min(1)).max(2000).default([]),
    excludeUserIds: z.array(z.string().min(1)).max(2000).default([]),
    invitedEmployers: z
      .array(invitedEmployer)
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

/** Slack for the minutes between picking "now" and pressing Save. */
const PAST_GRACE_MS = 10 * 60_000;

/**
 * Owner, 23 Nov: a drive link can't be backdated. A new start can't be in the past and the end must be ahead.
 * An edit may keep the start a live drive already has (`savedStartsAt`), so a running drive stays editable,
 * but never move it to another past time.
 */
export function drivePastDateProblem(d: { startsAt: Date; endsAt: Date }, opts: { now?: Date; savedStartsAt?: Date | null } = {}): { error: string; path: "startsAt" | "endsAt" } | null {
  const now = (opts.now ?? new Date()).getTime();
  const keptStart = opts.savedStartsAt != null && d.startsAt.getTime() === opts.savedStartsAt.getTime();
  if (!keptStart && d.startsAt.getTime() < now - PAST_GRACE_MS) return { error: "The drive can't open in the past. Pick today or a later date.", path: "startsAt" };
  if (d.endsAt.getTime() <= now) return { error: "The drive must close in the future.", path: "endsAt" };
  return null;
}

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
