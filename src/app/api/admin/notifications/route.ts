import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { realEmployers } from "@/lib/admin/scope";

const bodySchema = z.object({
  /** "both" (legacy audience) always means every active account of both types. */
  recipientType: z.enum(["intern", "employer", "both"]),
  /** Explicit list, or `all: true` for every active account of that type. */
  recipientIds: z.array(z.string()).default([]),
  all: z.boolean().default(false),
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.string().default("custom"),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const { recipientType } = parsed.data;
  const all = parsed.data.all || recipientType === "both";
  const allInterns = async () =>
    (await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "intern"), eq(schema.users.isActive, true)))).map((r) => r.id);
  // Never the internal "admin" / AI-interview employers.
  const allEmployers = async () =>
    (await db.select({ id: schema.employers.id }).from(schema.employers).where(and(realEmployers(), eq(schema.employers.isActive, true)))).map((r) => r.id);
  const recipients: { type: "intern" | "employer"; id: string }[] = all
    ? [
        ...(recipientType !== "employer" ? (await allInterns()).map((id) => ({ type: "intern" as const, id })) : []),
        ...(recipientType !== "intern" ? (await allEmployers()).map((id) => ({ type: "employer" as const, id })) : []),
      ]
    : parsed.data.recipientIds.map((id) => ({ type: recipientType as "intern" | "employer", id }));
  if (recipients.length === 0) return NextResponse.json({ error: "No recipients" }, { status: 400 });
  // Same `custom` notifications the per-person send writes, in chunks.
  for (let i = 0; i < recipients.length; i += 500) {
    await db.insert(schema.notifications).values(
      recipients.slice(i, i + 500).map((r) => ({
        recipientType: r.type,
        recipientId: r.id,
        type: parsed.data.type,
        title: parsed.data.title,
        message: parsed.data.message,
      })),
    );
  }
  return NextResponse.json({ ok: true, count: recipients.length });
}
