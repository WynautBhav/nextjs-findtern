import { NextResponse } from "next/server";

import { origin } from "@/lib/emails";
import { requireCollegeMutation } from "@/lib/college/guard";
import { driveInput, driveUrl } from "@/lib/college/drive-input";
import { generateDriveToken } from "@/lib/college/tokens";
import { getDb, schema } from "@/lib/db";

/** Create a drive. The link's token is returned once and never stored. */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "drive:create");
  if (!g.ok) return g.response;
  const parsed = driveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the drive details" }, { status: 400 });
  }
  const { token, hash } = generateDriveToken();
  const [drive] = await getDb()
    .insert(schema.collegeDrives)
    .values({ ...parsed.data, collegeId: g.ctx.college.id, tokenHash: hash, createdBy: g.ctx.admin.id })
    .returning({ id: schema.collegeDrives.id });
  return NextResponse.json({ id: drive.id, url: driveUrl(origin(), token) }, { status: 201 });
}
