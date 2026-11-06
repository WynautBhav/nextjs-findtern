import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { ImportError, commitImport, discardImport, remapImport } from "@/lib/college/roster-import";

const mapping = z.object({ name: z.number().int().min(-1), email: z.number().int(), phone: z.number().int().min(0).nullable() });
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remap"), mapping }),
  z.object({ action: z.literal("commit"), allowOverAllocation: z.boolean().optional() }),
  z.object({ action: z.literal("discard") }),
]);

/** Remap the columns, commit (409 if already committed/discarded, or over the paid seats without the flag), or discard. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; importId: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the details" }, { status: 400 });
  const { id, importId } = await ctx.params;
  const body = parsed.data;
  try {
    if (body.action === "remap") return NextResponse.json(await remapImport({ collegeId: id, importId, mapping: body.mapping }));
    if (body.action === "discard") {
      await discardImport({ collegeId: id, importId });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await commitImport({ collegeId: id, importId, adminId: guard.session.uid, allowOverAllocation: body.allowOverAllocation }));
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
