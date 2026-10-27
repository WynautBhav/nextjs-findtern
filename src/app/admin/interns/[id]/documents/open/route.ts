import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { allows } from "@/lib/admin/permissions";
import { candidateDocuments } from "@/lib/admin/candidate-documents";
import { readAny } from "@/lib/security/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shown in the browser; anything else is always a download. */
const INLINE = /^(image\/(jpeg|png|webp)|application\/pdf|video\/(mp4|webm|quicktime))$/;

/**
 * Open or download one of a candidate's documents, for staff (ADP-28).
 *
 * The key must be one of the files on that candidate's record (photo, intro
 * video, Aadhaar, PAN, marksheets, certificates), so this cannot be used to
 * read an arbitrary stored file by guessing names. Streams the bytes rather
 * than redirecting to a one-time signed URL, so View and Download both work
 * from the same page without the link going stale.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const noStore = { "Cache-Control": "no-store, private, max-age=0" };
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  if (!allows(session.permissions, ["interns:read"])) {
    return NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403, headers: noStore });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const doc = (await candidateDocuments(id)).find((d) => d.key === key);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404, headers: noStore });

  let file: { bytes: Buffer; contentType: string };
  try {
    file = await readAny(doc.key.replace(/^\/?uploads\//, ""));
  } catch {
    return NextResponse.json({ error: "The file is missing from storage" }, { status: 404, headers: noStore });
  }

  const inline = url.searchParams.get("download") !== "1" && INLINE.test(file.contentType);
  const ext = doc.key.includes(".") ? doc.key.slice(doc.key.lastIndexOf(".")).toLowerCase() : "";
  const filename = `${doc.label.replace(/[^\w.-]+/g, "-").toLowerCase()}${ext}`;
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      ...noStore,
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Content-Length": String(file.bytes.length),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
