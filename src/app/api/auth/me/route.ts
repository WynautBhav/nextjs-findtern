import { NextResponse } from "next/server";

import { getSessionUnfronted, unauthenticatedResponse } from "@/lib/auth";

export async function GET() {
  const { session } = await getSessionUnfronted();
  if (!session) {
    return unauthenticatedResponse();
  }
  return NextResponse.json({ user: { uid: session.uid, role: session.role, email: session.email } });
}
