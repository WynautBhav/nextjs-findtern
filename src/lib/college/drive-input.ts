import { z } from "zod";

/** Drive builder payload, shared by create and update. */
export const driveInput = z
  .object({
    title: z.string().trim().min(3, "Give the drive a name").max(120),
    kind: z.enum(["internship", "full_time"]),
    description: z.string().trim().max(2000).optional().default(""),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
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
