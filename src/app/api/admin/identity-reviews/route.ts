import { NextResponse } from "next/server";


import { getSession } from "@/lib/auth";
import { errorResponse, listPendingReviews, readDenied } from "@/lib/drives/admin-db";

/** Pending phone+name suggestions for one college: `?collegeId=`. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: session ? "Insufficient role" : "Unauthenticated" }, { status: session ? 403 : 401 });
  const denied = readDenied(req, session.permissions);
  if (denied) return denied;
  const collegeId = new URL(req.url).searchParams.get("collegeId");
  if (!collegeId) return NextResponse.json({ error: "collegeId is required" }, { status: 400 });
  try {
    return NextResponse.json({ reviews: await listPendingReviews(collegeId) });
  } catch (e) {
    return errorResponse(e);
  }
}
