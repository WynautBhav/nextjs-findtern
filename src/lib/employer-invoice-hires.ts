import { eq, inArray } from "drizzle-orm";

import * as schema from "./db/schema.ts";
import type { InvoiceHire } from "./employer-invoice.ts";
import { orderProposalIds } from "./order-ids.ts";

/**
 * How both Orders pages (employer and admin) load the hires their invoices
 * name: every proposal any of the payments covers, with the candidate's name
 * and the project, by one query. Same rows in, same invoice out. A proposal
 * that no longer exists is simply absent (its invoice lists no line for it);
 * a candidate with no name keeps an empty name rather than a made-up one.
 */

type Db = { select: (fields: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** One joined row -> the hire an invoice needs. */
export function toInvoiceHire(p: {
  id: string;
  offerDetails: unknown;
  currency: string | null;
  first: string | null;
  last: string | null;
  projectName: string | null;
}): InvoiceHire {
  return {
    proposalId: p.id,
    offerDetails: p.offerDetails,
    currency: p.currency,
    who: `${p.first ?? ""} ${p.last ?? ""}`.trim(),
    projectName: p.projectName,
  };
}

export async function loadInvoiceHires(db: Db, payments: readonly { raw: unknown }[]): Promise<Map<string, InvoiceHire>> {
  const ids = Array.from(new Set(payments.flatMap((o) => orderProposalIds(o.raw as Record<string, unknown> | null))));
  const hires = new Map<string, InvoiceHire>();
  if (ids.length === 0) return hires;
  const rows: Parameters<typeof toInvoiceHire>[0][] = await db
    .select({
      id: schema.proposals.id,
      offerDetails: schema.proposals.offerDetails,
      currency: schema.proposals.currency,
      first: schema.users.firstName,
      last: schema.users.lastName,
      projectName: schema.projects.projectName,
    })
    .from(schema.proposals)
    .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .where(inArray(schema.proposals.id, ids));
  for (const r of rows) hires.set(r.id, toInvoiceHire(r));
  return hires;
}
