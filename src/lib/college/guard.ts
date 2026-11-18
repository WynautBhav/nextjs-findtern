import { NextResponse } from "next/server";

import { unauthenticatedResponse } from "@/lib/auth";
import { requireMutation } from "@/lib/guards-mutation";
import { collegeAdminMay } from "./access";
import { getCollegeContext, type CollegeContext } from "./scope";

/**
 * requireMutation for placement officers, plus the action allowlist: a
 * college admin can run drives, the roster and nudges, and nothing else.
 */
export async function requireCollegeMutation(
  req: Request,
  action: string,
): Promise<{ ok: true; ctx: CollegeContext } | { ok: false; response: NextResponse }> {
  const guard = await requireMutation({ req, roles: ["college"] });
  if (!guard.ok) return guard;
  if (!collegeAdminMay(action)) {
    return { ok: false, response: NextResponse.json({ error: "Placement officers have read-only access" }, { status: 403 }) };
  }
  const ctx = await getCollegeContext();
  if (!ctx) return { ok: false, response: await unauthenticatedResponse() };
  return { ok: true, ctx };
}

/** Read guard for college GET handlers. */
export async function requireCollegeRead(): Promise<{ ok: true; ctx: CollegeContext } | { ok: false; response: NextResponse }> {
  const ctx = await getCollegeContext();
  if (!ctx) return { ok: false, response: await unauthenticatedResponse() };
  return { ok: true, ctx };
}
