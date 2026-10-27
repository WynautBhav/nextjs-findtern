import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { csvFilename, csvResponse, toCsv } from "@/lib/admin/csv";
import { flattenParams } from "@/lib/admin/params";
import { allows, EXPORT_PERMISSIONS } from "@/lib/admin/permissions";
import { realEmployerId } from "@/lib/admin/scope";
import { filterProposals, matchesSearch, parseIstDay, proposalTimezone } from "@/lib/admin/tracker";
import { parseOffer } from "@/lib/offer";
import { requireRole } from "@/lib/security/guards";

/**
 * Hired candidates as CSV (ADP-25; legacy had internship and full-time hire
 * lists with search and export). Same filters as the pipeline's Hired tab:
 * date range, company, candidate, timezone, search and `kind`
 * (internship | fulltime). A read, so `requireRole`, not `requireMutation`.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function GET(req: Request) {
  const guard = requireRole(req.headers.get("cookie") ?? "", ["admin"]);
  if (!guard.ok) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!allows(guard.session.permissions, EXPORT_PERMISSIONS.proposals)) {
    return new NextResponse("Your role doesn't include this export. Ask a super admin for access.", { status: 403 });
  }

  const params = flattenParams(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const rows = await getDb()
    .select({
      id: schema.proposals.id,
      status: schema.proposals.status,
      flowType: schema.proposals.flowType,
      currency: schema.proposals.currency,
      offerDetails: schema.proposals.offerDetails,
      createdAt: schema.proposals.createdAt,
      hiredAt: schema.proposals.hiredAt,
      internId: schema.proposals.internId,
      employerId: schema.proposals.employerId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      phone: schema.users.phoneNumber,
      companyName: schema.employers.companyName,
      projectName: schema.projects.projectName,
      projectTimezone: schema.projects.timezone,
    })
    .from(schema.proposals)
    .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
    .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .where(and(eq(schema.proposals.status, "hired"), realEmployerId(schema.proposals.employerId)))
    .orderBy(desc(schema.proposals.hiredAt), desc(schema.proposals.createdAt))
    .limit(10_000);

  const filtered = filterProposals(rows, {
    from: parseIstDay(params.from),
    to: parseIstDay(params.to, true),
    company: params.company ?? "",
    intern: params.intern ?? "",
    tz: params.tz ?? "",
  }).filter((p) => {
    const offer = parseOffer(p.offerDetails, p.currency);
    const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
    return (
      matchesSearch([name, p.email, p.phone, p.companyName, p.projectName, offer.roleTitle], params.q ?? "") &&
      (!params.kind || (params.kind === "fulltime" ? Boolean(offer.fullTime) : !offer.fullTime))
    );
  });

  const body = toCsv(filtered, [
    { header: "Candidate", value: (p) => `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() },
    { header: "Email", value: (p) => p.email },
    { header: "Phone", value: (p) => p.phone },
    { header: "Company", value: (p) => p.companyName },
    { header: "Project", value: (p) => p.projectName },
    { header: "Role", value: (p) => parseOffer(p.offerDetails, p.currency).roleTitle },
    { header: "Type", value: (p) => (parseOffer(p.offerDetails, p.currency).fullTime ? "Full-time" : "Internship") },
    { header: "Currency", value: (p) => parseOffer(p.offerDetails, p.currency).currency },
    {
      header: "Monthly amount",
      value: (p) => {
        const o = parseOffer(p.offerDetails, p.currency);
        return o.fullTime || o.monthlyMinor == null ? "" : (o.monthlyMinor / 100).toFixed(2);
      },
    },
    {
      header: "Annual CTC",
      value: (p) => {
        const ctc = parseOffer(p.offerDetails, p.currency).fullTime?.annualCtcMinor;
        return ctc == null ? "" : (ctc / 100).toFixed(2);
      },
    },
    { header: "Months", value: (p) => (parseOffer(p.offerDetails, p.currency).fullTime ? "" : parseOffer(p.offerDetails, p.currency).months) },
    { header: "Start date", value: (p) => parseOffer(p.offerDetails, p.currency).startDate ?? "" },
    { header: "Timezone", value: (p) => proposalTimezone(p) ?? "" },
    { header: "Hired on", value: (p) => iso(p.hiredAt) },
    { header: "Offer sent", value: (p) => iso(p.createdAt) },
    { header: "Proposal ID", value: (p) => p.id },
  ]);
  const suffix = params.kind === "fulltime" ? "hired-full-time" : params.kind === "internship" ? "hired-internships" : "hired";
  return csvResponse(body, csvFilename(suffix));
}
