import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";
import { ImportError, previewImport } from "@/lib/college/roster-import";

// 2 MB of file is ~2.67 MB of base64; the decoded size is checked again in readTable.
const bodySchema = z.object({ fileName: z.string().trim().min(1).max(200), fileBase64: z.string().min(1).max(2_800_000) });

/**
 * Upload a roster (.csv, .tsv or .xlsx) and get the classified preview. Nothing is written to the roster
 * until the import is confirmed. The same file again returns the same import.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a .csv, .tsv or .xlsx file" }, { status: 400 });
  const { id } = await ctx.params;
  const [college] = await getDb().select({ id: schema.colleges.id }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = new Uint8Array(Buffer.from(parsed.data.fileBase64, "base64"));
  try {
    const r = await previewImport({ collegeId: id, adminId: guard.session.uid, fileName: parsed.data.fileName, bytes });
    if (!r.ok) {
      const { status, ...body } = r;
      return NextResponse.json(body, { status });
    }
    return NextResponse.json(r.preview);
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
