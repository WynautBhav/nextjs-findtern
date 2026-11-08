import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.ts"; // relative so the unit test can load this without the @/ alias
import type { ProposalCardData } from "./ui-logic";

/**
 * The proposal a thread hangs off, for the card under the conversation header. Reads only: the caller must be the
 * thread's employer or intern and the proposal must be that same pair's, else null. An intern never sees a draft.
 * Nothing here identifies the other side (no names, no contact). A database error is logged and returns null.
 */
export async function threadProposalCard(threadId: string, uid: string, role: "employer" | "intern"): Promise<ProposalCardData | null> {
  try {
    const db = getDb();
    const [t] = await db.select().from(schema.threads).where(eq(schema.threads.id, threadId)).limit(1);
    if (!t?.proposalId) return null;
    if ((role === "employer" ? t.employerId : t.internId) !== uid) return null;
    const [p] = await db
      .select({ id: schema.proposals.id, status: schema.proposals.status, offer: schema.proposals.offerDetails, project: schema.projects.projectName })
      .from(schema.proposals)
      .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
      .where(and(eq(schema.proposals.id, t.proposalId), eq(schema.proposals.employerId, t.employerId), eq(schema.proposals.internId, t.internId)))
      .limit(1);
    if (!p || (role === "intern" && p.status === "draft")) return null;
    const offer = (p.offer ?? {}) as { roleTitle?: unknown; duration?: unknown };
    const title = (typeof offer.roleTitle === "string" && offer.roleTitle.trim()) || p.project || "Proposal";
    return { id: p.id, title, status: p.status, duration: typeof offer.duration === "string" ? offer.duration : null };
  } catch (err) {
    // The card is decoration under the header; a failed read must not take the whole thread page down.
    console.error("[messaging] proposal card failed", err);
    return null;
  }
}
