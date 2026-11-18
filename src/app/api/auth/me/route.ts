import { NextResponse } from "next/server";

import { getSession, unauthenticatedResponse } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return unauthenticatedResponse();
  }
  return NextResponse.json({ user: { uid: session.uid, role: session.role, email: session.email } });
}
