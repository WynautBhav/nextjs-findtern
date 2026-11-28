import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { FOLLOW_UP_NOTE_MAX, FOLLOW_UP_TARGETS, callChangeError, callsOf, statusOf, type FollowUpTarget } from "@/lib/admin/follow-ups";
import { canWrite, allows, requiredPermissions } from "@/lib/admin/permissions";
import { realEmployers } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Master data follow-up calls. POST ticks or undoes Call 1 / Call 2 (one log row each; the newest row per call wins);
 * GET lists one record's call history for the drawer. The Nudge mark is never written here: it comes from admin nudges.
 * Each target type also needs the rights of its own admin page: students follow /admin/interns, employers
 * /admin/companies, colleges /admin/colleges (read for GET, write for POST).
 */

const PAGE: Record<FollowUpTarget, string> = { student: "/admin/interns", employer: "/admin/companies", college: "/admin/colleges" };

const bodySchema = z
  .object({
    targetType: z.enum(FOLLOW_UP_TARGETS),
    targetId: z.string().trim().min(1).max(64),
    call: z.union([z.literal(1), z.literal(2)]),
    done: z.boolean(),
    note: z.string().trim().max(FOLLOW_UP_NOTE_MAX).optional(),
  })
  .strict();

/** The record must exist (and an employer must be a real one, as every admin list shows them). */
async function targetExists(type: FollowUpTarget, id: string): Promise<boolean> {
  const db = getDb();
  if (type === "student") {
    const [r] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.id, id), eq(schema.users.role, "intern"))).limit(1);
    return Boolean(r);
  }
  if (type === "employer") {
    const [r] = await db.select({ id: schema.employers.id }).from(schema.employers).where(and(eq(schema.employers.id, id), realEmployers())).limit(1);
    return Boolean(r);
  }
  const [r] = await db.select({ id: schema.colleges.id }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  return Boolean(r);
}

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Pick Call 1 or Call 2; the note can be up to ${FOLLOW_UP_NOTE_MAX} characters.` }, { status: 400 });
  const { targetType, targetId, call, done } = parsed.data;
  const note = parsed.data.note ? parsed.data.note : null;

  if (!canWrite(guard.session.permissions, PAGE[targetType])) return NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 });
  if (!(await targetExists(targetType, targetId))) return NextResponse.json({ error: "That record no longer exists." }, { status: 404 });

  const f = schema.adminFollowUps;
  const result = await getDb().transaction(async (tx) => {
    // One writer per record at a time, so two tabs cannot both pass the order check (Call 2 before Call 1).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`follow-up:${targetType}:${targetId}`}))`);
    const log = await tx.select({ status: f.status, note: f.note, createdAt: f.createdAt }).from(f).where(and(eq(f.targetType, targetType), eq(f.targetId, targetId)));
    const cur = callsOf(log);
    const error = callChangeError({ call1: cur.call1 !== null, call2: cur.call2 !== null }, { call, done });
    if (error) return { error };
    const [row] = await tx.insert(f).values({ targetType, targetId, status: statusOf(call, done), note, adminId: guard.session.uid }).returning();
    await recordAdminAudit(tx, { adminId: guard.session.uid, action: "follow_up.set", targetType, targetId, meta: { call, done, hasNote: note !== null } }, { strict: true });
    return { row };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, call, done, at: result.row.createdAt.toISOString() });
}

export async function GET(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const type = FOLLOW_UP_TARGETS.find((t) => t === url.searchParams.get("type"));
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!type || !id || id.length > 64) return NextResponse.json({ error: "Missing record." }, { status: 400 });
  if (!allows(guard.session.permissions, requiredPermissions(PAGE[type]))) return NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 });

  const f = schema.adminFollowUps;
  const rows = await getDb()
    .select({ status: f.status, note: f.note, at: f.createdAt, by: sql<string | null>`(SELECT ${schema.admins.name} FROM ${schema.admins} WHERE ${schema.admins.id} = ${f.adminId})` })
    .from(f)
    .where(and(eq(f.targetType, type), eq(f.targetId, id)))
    .orderBy(desc(f.createdAt))
    .limit(50);
  return NextResponse.json({ history: rows.map((r) => ({ ...r, at: r.at.toISOString() })) });
}
