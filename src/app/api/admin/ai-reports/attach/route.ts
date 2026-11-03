import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AttachError, attachAiFeedbackLink, currentReportFileId } from "@/lib/admin/ai-report-link";
import { driveErrorResponse, idSchema, MAX_REPORT_BYTES } from "@/lib/admin/ai-report-api";
import { getDb, schema } from "@/lib/db";
import { REPORT_SOURCE, driveAccessToken, getFile, shareAnyoneWithLink, trashFile } from "@/lib/google-drive";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Admin: after the browser finished uploading to Drive, publishes the file:
 * checks it is the report we made for THIS candidate, shares it as
 * "anyone with the link", and makes it the candidate's Feedback report.
 */

const bodySchema = z.object({
  internId: idSchema,
  fileId: z.string().trim().regex(/^[\w-]{10,100}$/, "Invalid file id"),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  const { internId, fileId } = parsed.data;

  const [intern] = await getDb()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, internId), eq(schema.users.role, "intern")))
    .limit(1);
  if (!intern) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  try {
    const token = await driveAccessToken();
    const file = await getFile(token, fileId);
    // `drive.file` only shows us files this app made, and the properties were set by upload-session, not the browser.
    const size = Number(file.size ?? 0);
    const ours =
      file.appProperties?.source === REPORT_SOURCE &&
      file.appProperties?.internId === internId &&
      file.mimeType === "application/pdf" &&
      !file.trashed &&
      size > 0 &&
      size <= MAX_REPORT_BYTES;
    if (!ours) return NextResponse.json({ error: "That file is not a report uploaded for this candidate." }, { status: 400 });

    await shareAnyoneWithLink(token, file.id);
    const link = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;

    // Re-submitting the file that is already the live report must never bin it if something fails this time.
    const alreadyLive = (await currentReportFileId(internId)) === file.id;

    let previous: string | null;
    try {
      ({ previousDriveFileId: previous } = await attachAiFeedbackLink(internId, link, {
        driveFileId: file.id,
        fileName: file.name,
        canId: file.name.match(/\bCAN\d+\b/)?.[0] ?? null,
        by: guard.session.uid,
      }));
    } catch (e) {
      // Don't leave a public, unattached report in Drive (unless it is the live one).
      if (!alreadyLive) await trashFile(token, file.id).catch(() => {});
      if (e instanceof AttachError) return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
      throw e;
    }

    // The report it replaces (ours, from an earlier upload) goes to the Drive bin; never the one just attached.
    if (previous && previous !== file.id) await trashFile(token, previous).catch((e) => console.error("[ai-reports] old file not trashed", e));

    return NextResponse.json({ ok: true, link });
  } catch (e) {
    return driveErrorResponse(e);
  }
}
