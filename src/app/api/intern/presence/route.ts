import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";

const bodySchema = z.object({ visible: z.boolean() });

/** The student's switch (OA2): off hides the "Online now / Active …" label from employers. */
export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say whether your activity should be shown." }, { status: 400 });
  const hidden = !parsed.data.visible;
  await getDb()
    .insert(schema.userPresence)
    .values({ userType: "intern", userId: guard.session.uid, hidden, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({ target: [schema.userPresence.userType, schema.userPresence.userId], set: { hidden } });
  return NextResponse.json({ visible: parsed.data.visible });
}
