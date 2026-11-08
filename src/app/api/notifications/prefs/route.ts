import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { prefsBody } from "@/lib/notify-prefs-input";
import { RateLimiter } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(20, 60_000);

/**
 * The signed-in student or employer changes their own optional-notification switches. The row is the session
 * user's (no id in the request, so there is nothing to tamper with). Payments, invoices, security and the rest of
 * the required mail have no switch; see lib/notify-prefs.ts for what these two control.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern", "employer"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  if (!limiter.take(`np:${uid}`)) return NextResponse.json({ error: "Too many changes. Wait a minute and try again." }, { status: 429 });

  const parsed = prefsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose on or off." }, { status: 400 });

  const set = { ...parsed.data, updatedAt: new Date() };
  await getDb()
    .insert(schema.notificationPrefs)
    .values({ userId: uid, ...set })
    .onConflictDoUpdate({ target: schema.notificationPrefs.userId, set });
  const [row] = await getDb()
    .select({ emailMessages: schema.notificationPrefs.emailMessages, pushMessages: schema.notificationPrefs.pushMessages })
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, uid))
    .limit(1);
  return NextResponse.json(row, { headers: { "Cache-Control": "no-store" } });
}
