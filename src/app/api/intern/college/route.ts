import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { maskCode, parseCollegeCode } from "@/lib/college/code";
import { takeCodeAttempt } from "@/lib/college/code-throttle";
import { BAD_COLLEGE_CODE, joinCollegeByCode, leaveCollege, membershipOf } from "@/lib/college/membership";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { clientIp } from "@/lib/security/rate-limit";

// Strict on purpose: a body that names a college (collegeId, name, slug) is refused, it can only carry a code.
const bodySchema = z
  .object({
    code: z.string("Enter your college code").max(60, BAD_COLLEGE_CODE),
    year: z.number("Choose your year, 1 to 5").int("Choose your year, 1 to 5").min(1, "Choose your year, 1 to 5").max(5, "Choose your year, 1 to 5").nullable(),
    branch: z.string("Enter your branch").trim().min(1, "Enter your branch").max(120, "Enter your branch"),
    declaredAdult: z.boolean(),
  })
  .strict();

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "intern") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  return NextResponse.json({ college: await membershipOf(session.uid) });
}

/** Join a college with its code. The only way in: there is no list to pick from. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.code === "unrecognized_keys" ? "Enter your college code" : (parsed.error.issues[0]?.message ?? "Enter your college code") }, { status: 400 });

  // Every attempt is charged before the code is looked at: user, address and a day-long tier (code-throttle.ts).
  const ip = clientIp(req.headers);
  const throttle = takeCodeAttempt({ uid, ip });
  if (!throttle.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(throttle.retryAfterSeconds / 60)} minute${throttle.retryAfterSeconds > 60 ? "s" : ""}.` },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } },
    );
  }

  const r = await joinCollegeByCode({ ...parsed.data, userId: uid });
  // The trail keeps who tried, from where and a masked code (never the whole code); a miss and a switched-off college look alike.
  await recordAdminAudit(getDb(), {
    adminId: uid,
    action: r.ok ? "college_code.joined" : "college_code.attempt",
    targetType: "intern",
    targetId: uid,
    meta: { outcome: r.ok ? "joined" : r.reason === "code" ? "no_match" : r.reason, codeMask: maskCode(parsed.data.code), shapeOk: parseCollegeCode(parsed.data.code) !== null, ip },
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ college: r.college });
}

/** Leave the college. Takes effect immediately everywhere. */
export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  await leaveCollege(guard.session.uid);
  return NextResponse.json({ ok: true });
}
