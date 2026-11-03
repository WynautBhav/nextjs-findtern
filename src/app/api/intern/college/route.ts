import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { joinCollege, leaveCollege, membershipOf } from "@/lib/college/membership";
import { getSession } from "@/lib/auth";

const bodySchema = z.object({
  collegeId: z.string().min(1),
  year: z.number().int().min(1).max(5).nullable(),
  branch: z.string().trim().max(120).nullable(),
  declaredAdult: z.boolean(),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "intern") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  return NextResponse.json({ college: await membershipOf(session.uid) });
}

/** Pick (or change) my college. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose your college" }, { status: 400 });
  const r = await joinCollege({
    ...parsed.data,
    branch: parsed.data.branch || null,
    userId: guard.session.uid,
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
