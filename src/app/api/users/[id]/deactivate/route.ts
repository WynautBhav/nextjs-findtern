import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { forgetAccountStatus } from "@/lib/account-status";
import { requireMutation } from "@/lib/guards-mutation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const updated = await db
    .update(schema.users)
    .set({ isActive: false })
    .where(eq(schema.users.id, id))
    .returning({ id: schema.users.id });
  if (!updated.length) return NextResponse.json({ error: "No candidate account with that id." }, { status: 404 });
  forgetAccountStatus("intern", id);
  return NextResponse.json({ ok: true });
}
