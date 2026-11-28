import { and, desc, eq, inArray, ne, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { loadOpenOrderIds } from "@/lib/admin/expired-load";
import { drawerOf, nameOf, payOf, type DrawerProposal } from "@/lib/admin/proposal-drawer-data";
import { acceptedPayOf, proposalPipelineStatus, type PipelineBucket } from "@/lib/admin/proposal-pipeline";
import { withTrueInterviewStatus } from "@/lib/admin/tracker";
import { formatDate } from "@/lib/format";
import { effectiveProposalStatus, expiryOf } from "@/lib/proposal-expiry";
import { offerKind, offerPdf, type OfferKind } from "./project-offers-pure.ts";

export type ProjectOfferRow = {
  id: string;
  internId: string;
  candidate: string;
  email: string | null;
  phone: string | null;
  kind: OfferKind;
  bucket: PipelineBucket;
  pay: string;
  sent: string;
  pdf: { available: true } | { available: false; reason: string };
  drawer: DrawerProposal;
};

/**
 * Every offer sent on one project (drafts were never sent), newest first, each with the Proposal pipeline's bucket and
 * drawer, built the way the pipeline page builds them (stored status, the open-checkout freeze, proposalPipelineStatus).
 * The same rows (project_id, status <> 'draft') the Projects row counts.
 */
export function loadProjectOffers(projectId: string, now: Date = new Date()): Promise<ProjectOfferRow[]> {
  return loadOfferRows(eq(schema.proposals.projectId, projectId), now);
}

/** One sent offer, built exactly as the pop-up lists it (the proposal PDF renders this). Null for an unknown id or a draft. */
export async function loadOfferRow(id: string, now: Date = new Date()): Promise<ProjectOfferRow | null> {
  return (await loadOfferRows(eq(schema.proposals.id, id), now))[0] ?? null;
}

async function loadOfferRows(match: SQL, now: Date): Promise<ProjectOfferRow[]> {
  const db = getDb();
  const pr = schema.proposals;
  const [rows, openOrderIds] = await Promise.all([
    db
      .select({
        id: pr.id,
        status: pr.status,
        flowType: pr.flowType,
        currency: pr.currency,
        offerDetails: pr.offerDetails,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        hiredAt: pr.hiredAt,
        interviewId: pr.interviewId,
        internId: pr.internId,
        internFirstName: schema.users.firstName,
        internLastName: schema.users.lastName,
        internEmail: schema.users.email,
        internPhone: schema.users.phoneNumber,
        employerId: pr.employerId,
        companyName: schema.employers.companyName,
        projectId: pr.projectId,
        projectName: schema.projects.projectName,
        projectTimezone: schema.projects.timezone,
      })
      .from(pr)
      .leftJoin(schema.users, eq(schema.users.id, pr.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, pr.employerId))
      .leftJoin(schema.projects, eq(schema.projects.id, pr.projectId))
      .where(and(match, ne(pr.status, "draft")))
      .orderBy(desc(pr.createdAt), pr.id),
    loadOpenOrderIds(now),
  ]);
  const ivIds = rows.map((r) => r.interviewId).filter((x): x is string => Boolean(x));
  const ivs = ivIds.length
    ? await db
        .select({
          id: schema.interviews.id,
          status: schema.interviews.status,
          slot1: schema.interviews.slot1,
          slot2: schema.interviews.slot2,
          slot3: schema.interviews.slot3,
          selectedSlot: schema.interviews.selectedSlot,
          timezone: schema.interviews.timezone,
          meetingLink: schema.interviews.meetingLink,
          createdAt: schema.interviews.createdAt,
          employerId: schema.interviews.employerId,
        })
        .from(schema.interviews)
        .where(inArray(schema.interviews.id, ivIds))
    : [];
  const ivById = new Map(withTrueInterviewStatus(ivs, now.getTime()).map((i) => [i.id, i]));

  const out: ProjectOfferRow[] = [];
  for (const p of rows) {
    const rule = { status: p.status, hiredAt: p.hiredAt, offerDetails: p.offerDetails, currency: p.currency, hasOpenOrder: p.status === "accepted" && openOrderIds.has(p.id) };
    const bucket = proposalPipelineStatus(rule, now);
    if (!bucket) continue;
    const expiry = p.status === "withdrawn" ? ("withdrawn" as const) : expiryOf(rule, now).reason;
    const iv = p.interviewId ? ivById.get(p.interviewId) : undefined;
    const item = {
      ...p,
      status: effectiveProposalStatus(rule, now),
      storedStatus: p.status,
      bucket,
      pay: acceptedPayOf(bucket, p.status),
      expiryReason: bucket === "expired" || bucket === "withdrawn" ? expiry : null,
      interview: iv
        ? { id: iv.id, status: iv.status, createdAt: iv.createdAt, slot: iv.selectedSlot === 1 ? iv.slot1 : iv.selectedSlot === 2 ? iv.slot2 : iv.selectedSlot === 3 ? iv.slot3 : null, timezone: iv.timezone, meetingLink: iv.meetingLink, isAi: false }
        : null,
    };
    out.push({
      id: p.id,
      internId: p.internId,
      candidate: nameOf(item),
      email: p.internEmail,
      phone: p.internPhone,
      kind: offerKind(p.offerDetails, p.currency),
      bucket,
      pay: payOf(item),
      sent: formatDate(p.createdAt),
      pdf: offerPdf(p.offerDetails, p.currency),
      drawer: drawerOf(item),
    });
  }
  return out;
}
