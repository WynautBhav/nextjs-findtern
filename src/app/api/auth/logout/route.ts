import { NextResponse } from "next/server";

import { clearAdminStash } from "@/lib/admin/impersonation";
import { withLogout } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  await clearAdminStash(res);
  return withLogout(res);
}
