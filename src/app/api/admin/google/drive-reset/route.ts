import { NextResponse } from "next/server";

import { clearSlotToken } from "@/lib/google-connections";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Admin: Drive goes back to the calendar's Google account. Only the Drive slot's own row is removed; the
 * calendar connection is untouched. Files already saved stay where they are.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  try {
    await clearSlotToken("drive");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[google] drive reset failed", e);
    return NextResponse.json({ error: "Couldn't reset the Drive connection. Try again." }, { status: 500 });
  }
}
