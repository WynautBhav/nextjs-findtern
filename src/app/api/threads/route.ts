import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";
import { canStartThread } from "@/lib/messaging/logic";
import { listThreads, threadLimiter } from "@/lib/messaging/store";
import { internLockResponse } from "@/lib/intern-unlock";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "employer" && session.role !== "intern")) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const locked = await internLockResponse(session);
  if (locked) return locked;
  return NextResponse.json({ threads: await listThreads(session.uid, session.role) }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.object({ counterpartId: z.string().min(1).max(64), proposalId: z.string().min(1).max(64).optional() });

/**
 * Create or fetch a thread. Employers need a real proposal to that intern;
 * interns may reply where a proposal exists or the employer already started a
 * thread. Everything else is a 404 so ids cannot be probed.
 * Note: message content is not scanned for contact details yet.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;
  const locked = await internLockResponse(guard.session);
  if (locked) return locked;
  const { session } = guard;
  if (!threadLimiter.take(`thr:${session.uid}`)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { counterpartId, proposalId } = parsed.data;

  const role = session.role as "employer" | "intern";
  const employerId = role === "employer" ? session.uid : counterpartId;
  const internId = role === "intern" ? session.uid : counterpartId;
  const db = getDb();

  const props = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(and(eq(schema.proposals.employerId, employerId), eq(schema.proposals.internId, internId)));
  const hasProposal = props.length > 0;
  const proposalMatchesPair = !proposalId || props.some((p) => p.id === proposalId);
  const [existing] = await db
    .select({ id: schema.threads.id })
    .from(schema.threads)
    .where(and(eq(schema.threads.employerId, employerId), eq(schema.threads.internId, internId)))
    .limit(1);

  if (!canStartThread({ role, hasProposal, proposalMatchesPair, employerAlreadyMessaged: !!existing })) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .insert(schema.threads)
    .values({ employerId, internId, proposalId: proposalId ?? null })
    .onConflictDoNothing();
  const [t] = await db
    .select()
    .from(schema.threads)
    .where(
      and(
        eq(schema.threads.employerId, employerId),
        eq(schema.threads.internId, internId),
        sql`COALESCE(${schema.threads.proposalId}, '') = ${proposalId ?? ""}`,
      ),
    )
    .limit(1);
  return NextResponse.json({ thread: { id: t.id, proposalId: t.proposalId } });
}
