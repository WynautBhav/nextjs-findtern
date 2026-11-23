import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { exitCampusDrive } from "@/lib/college/campus-lock";

const bodySchema = z.object({ driveId: z.string().uuid() });

/**
 * "Exit campus drive": the company leaves the drive now. The campus lock lifts on the next request, new offers are billed at
 * standard rates, offers and hires made inside the drive keep their drive terms, and the placement officers are emailed.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const out = await exitCampusDrive(guard.session.uid, parsed.data.driveId);
  if (!out) return NextResponse.json({ error: "You're not in this drive." }, { status: 404 });
  return NextResponse.json({ ok: true, exitedAt: out.exitedAt.toISOString(), redirect: "/employer/candidates" });
}
