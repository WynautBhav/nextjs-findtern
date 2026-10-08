import { NextResponse } from "next/server";

import { withLogout } from "@/lib/auth";

export async function POST() {
  return withLogout(NextResponse.json({ ok: true }));
}
