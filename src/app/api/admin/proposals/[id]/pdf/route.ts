import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { recordAdminAudit } from "@/lib/admin/audit";
import { loadOfferRow } from "@/lib/admin/project-offers";
import { proposalPdfFilename, proposalPdfText } from "@/lib/admin/proposal-pdf";
import { renderProposalPdf } from "@/lib/admin/proposal-pdf-render";
import { getDb } from "@/lib/db";
import { formatIstStamp } from "@/lib/format";
import { hasAnyPermission } from "@/lib/security/guards";

export const runtime = "nodejs";

/**
 * Any sent proposal as a PDF, for admins (the proxy rule is interns:read; checked here too). Built from the same drawer
 * data the Projects pop-up shows (project-offers.ts loadOfferRow). Drafts and unknown ids are 404. Audited, fail closed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasAnyPermission(session, ["interns:read"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await loadOfferRow(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await renderProposalPdf(proposalPdfText(row, formatIstStamp(new Date())));

  try {
    await recordAdminAudit(getDb(), { adminId: session.uid, action: "export.proposal_pdf", targetType: "proposal", targetId: id, meta: { internId: row.internId, outcome: row.bucket } }, { strict: true });
  } catch (err) {
    console.error("[admin/proposals/pdf] audit insert failed", err);
    return NextResponse.json({ error: "Could not record the export" }, { status: 500 });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${proposalPdfFilename(row.candidate, row.drawer.company)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
