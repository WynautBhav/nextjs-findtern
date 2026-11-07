import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { errorResponse, getImportView, readDenied } from "@/lib/drives/admin-db";

type Ctx = { params: Promise<{ id: string }> };

/** The stored preview, rebuilt from the server's own entries. */
export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: session ? "Insufficient role" : "Unauthenticated" }, { status: session ? 403 : 401 });
  const denied = readDenied(req, session.permissions);
  if (denied) return denied;
  try {
    return NextResponse.json(await getImportView((await ctx.params).id));
  } catch (e) {
    return errorResponse(e);
  }
}
