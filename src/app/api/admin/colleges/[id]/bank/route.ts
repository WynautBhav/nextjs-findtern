import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/** Reveal a college's full bank account number to the admin paying it. Audited before the value leaves. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!allows(g.session.permissions, ["transactions:write"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select({ n: schema.colleges.bankAccountNumber }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!row?.n) return NextResponse.json({ error: "Nothing on file" }, { status: 404 });
  await recordAdminAudit(db, { adminId: g.session.uid, action: "college.bank_reveal", targetType: "college", targetId: id }, { strict: true });
  return NextResponse.json({ value: row.n }, { headers: { "Cache-Control": "no-store, private, max-age=0" } });
}
