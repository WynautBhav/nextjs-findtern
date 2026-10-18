import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { parseOffer } from "@/lib/offer";
import { readAny } from "@/lib/security/store";

export const runtime = "nodejs";

/** The full-time offer letter, for the two parties on the proposal and admins. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const [p] = await getDb().select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const party = session.role === "admin" || session.uid === p.internId || session.uid === p.employerId;
  if (!party) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ft = parseOffer(p.offerDetails, p.currency).fullTime;
  const name = ft?.offerLetterKey ?? ft?.offerLetterUrl?.replace(/^\/uploads\//, "") ?? null;
  if (!name) return NextResponse.json({ error: "No offer letter" }, { status: 404 });
  try {
    const file = await readAny(decodeURIComponent(name));
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="offer-letter-${id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
