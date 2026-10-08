import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ phone: string }> }) {
  const { phone } = await params;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return NextResponse.json({ exists: false });
  const db = getDb();
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phoneNumber, digits)).limit(1);
  const [e] = await db.select({ id: schema.employers.id }).from(schema.employers).where(eq(schema.employers.phoneNumber, digits)).limit(1);
  return NextResponse.json({ exists: Boolean(u || e) });
}
