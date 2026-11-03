import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { canIdSchema, driveErrorResponse, idSchema, MAX_REPORT_BYTES, reportFileName } from "@/lib/admin/ai-report-api";
import { getDb, schema } from "@/lib/db";
import { createUploadSession, driveAccessToken } from "@/lib/google-drive";
import { publicOrigin } from "@/lib/google";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Admin: starts a Google Drive upload for one candidate's redacted report and
 * returns the one-time upload URL. The browser sends the PDF straight to
 * Google, so it never passes through this server's request-size limit.
 */

const bodySchema = z.object({
  internId: idSchema,
  canId: canIdSchema.nullable().optional(),
  size: z.number().int().min(1024, "That file is too small to be a report.").max(MAX_REPORT_BYTES, "The redacted report is over 25 MB."),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  const { internId, canId, size } = parsed.data;

  const [intern] = await getDb()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, internId), eq(schema.users.role, "intern")))
    .limit(1);
  if (!intern) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  try {
    const token = await driveAccessToken();
    const uploadUrl = await createUploadSession(token, {
      name: reportFileName(canId, internId),
      internId,
      size,
      origin: publicOrigin(req),
    });
    return NextResponse.json({ uploadUrl });
  } catch (e) {
    return driveErrorResponse(e);
  }
}
