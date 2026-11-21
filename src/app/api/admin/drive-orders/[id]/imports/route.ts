import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { requireMutation } from "@/lib/guards-mutation";
import { collegeListCsv, createImportPreview, errorResponse, listImports, readDenied } from "@/lib/drives/admin-db";
import { MAX_UPLOAD_BYTES, sniffRosterFile } from "@/lib/drives/admin-rules";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: session ? "Insufficient role" : "Unauthenticated" }, { status: session ? 403 : 401 });
  const denied = readDenied(req, session.permissions);
  if (denied) return denied;
  try {
    return NextResponse.json({ imports: await listImports((await ctx.params).id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Upload a roster (multipart `file`, optional `mapping` JSON). Returns a stored preview; the same file for the same order returns the same import. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  // The college keeps its own student list in its console (name, phone, email). Using it here is the normal path:
  // the same rows go through the same checks as an uploaded file, so nothing about the import rules changes.
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { source?: unknown } | null;
    if (body?.source !== "college_list") return NextResponse.json({ error: "Choose a CSV or Excel file." }, { status: 400 });
    try {
      const orderId = (await ctx.params).id;
      const bytes = await collegeListCsv(orderId);
      if (!bytes) return NextResponse.json({ error: "This college has not added its student list yet. Ask the placement officer to add it in their console, or upload a file here." }, { status: 409 });
      const out = await createImportPreview({ orderId, bytes, fileName: "College student list", mappingRaw: { name: 0, email: 1, phone: 2 }, adminId: g.session.uid });
      if (out.needsMapping) return NextResponse.json({ error: "The college's list could not be read." }, { status: 500 });
      const v = out.view;
      return NextResponse.json({ ok: true, needsMapping: false, importId: v.importId, status: v.status, replayed: v.replayed, headers: out.headers, suggestedMapping: out.suggestedMapping, mapping: v.mapping, rows: v.rows, truncated: v.truncated, counts: v.counts });
    } catch (e) {
      return errorResponse(e);
    }
  }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return NextResponse.json({ error: "The file is larger than 5 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Choose a CSV or Excel file." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "The file is larger than 5 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffRosterFile(bytes)) return NextResponse.json({ error: "Only CSV or Excel (.xlsx) files are accepted." }, { status: 415 });
  let mappingRaw: unknown | null = null;
  const m = form.get("mapping");
  if (typeof m === "string" && m.trim()) {
    try {
      mappingRaw = JSON.parse(m);
    } catch {
      return NextResponse.json({ error: "Mapping is not valid JSON." }, { status: 400 });
    }
  }
  try {
    const out = await createImportPreview({ orderId: (await ctx.params).id, bytes, fileName: file.name || "roster", mappingRaw, adminId: g.session.uid });
    if (out.needsMapping) return NextResponse.json({ ok: true, needsMapping: true, importId: null, headers: out.headers, suggestedMapping: out.suggestedMapping });
    const v = out.view;
    return NextResponse.json({ ok: true, needsMapping: false, importId: v.importId, status: v.status, replayed: v.replayed, headers: out.headers, suggestedMapping: out.suggestedMapping, mapping: v.mapping, rows: v.rows, truncated: v.truncated, counts: v.counts });
  } catch (e) {
    return errorResponse(e);
  }
}
