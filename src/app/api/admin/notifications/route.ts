import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { realEmployers } from "@/lib/admin/scope";
import { cleanNotificationType, normaliseAudience } from "@/lib/admin/notification-types";

const side = z.object({ all: z.boolean().default(false), ids: z.array(z.string()).max(5000).default([]) });

const bodySchema = z.object({
  /** Older single-audience shape; "both" alone means everyone on both sides (legacy). */
  recipientType: z.enum(["intern", "employer", "both"]).optional(),
  recipientIds: z.array(z.string()).max(5000).default([]),
  all: z.boolean().default(false),
  /** Per-side audiences, so "both" can target picked people (ADP-10). */
  interns: side.optional(),
  employers: side.optional(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
  /** Legacy free-text type ("custom", "update", "promo"...). */
  type: z.string().optional(),
  /** Legacy `notifications.data` JSON, e.g. a deep link { link: "/intern/proposals" }. */
  data: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  if (JSON.stringify(d.data).length > 4000) return NextResponse.json({ error: "Data is too large (4 KB max)." }, { status: 400 });
  const link = d.data.link;
  if (link !== undefined && (typeof link !== "string" || !link.startsWith("/") || link.startsWith("//"))) {
    return NextResponse.json({ error: "A link must be a path on this site, starting with /." }, { status: 400 });
  }

  const audience = normaliseAudience(d);
  const db = getDb();

  // Only real, active accounts: picked ids are checked against the table so a
  // stale or made-up id never gets a notification row (ADP-26).
  const internIds = audience.intern
    ? (
        await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.role, "intern"),
              eq(schema.users.isActive, true),
              audience.intern.all ? undefined : inArray(schema.users.id, audience.intern.ids),
            ),
          )
      ).map((r) => r.id)
    : [];
  // Never the internal "admin" / AI-interview employers.
  const employerIds = audience.employer
    ? (
        await db
          .select({ id: schema.employers.id })
          .from(schema.employers)
          .where(
            and(
              realEmployers(),
              eq(schema.employers.isActive, true),
              audience.employer.all ? undefined : inArray(schema.employers.id, audience.employer.ids),
            ),
          )
      ).map((r) => r.id)
    : [];

  const recipients = [
    ...internIds.map((id) => ({ type: "intern" as const, id })),
    ...employerIds.map((id) => ({ type: "employer" as const, id })),
  ];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Nobody to send to: pick at least one active candidate or company." }, { status: 400 });
  }

  const type = cleanNotificationType(d.type);
  for (let i = 0; i < recipients.length; i += 500) {
    await db.insert(schema.notifications).values(
      recipients.slice(i, i + 500).map((r) => ({
        recipientType: r.type,
        recipientId: r.id,
        type,
        title: d.title,
        message: d.message,
        data: d.data,
      })),
    );
  }
  return NextResponse.json({ ok: true, count: recipients.length, interns: internIds.length, employers: employerIds.length });
}
