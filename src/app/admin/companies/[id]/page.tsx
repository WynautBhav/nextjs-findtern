import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq, getTableColumns, inArray } from "drizzle-orm";

import { ContactEditor } from "@/components/admin/contact-editor";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { getSession } from "@/lib/auth";
import { canViewAs } from "@/lib/admin/impersonation";
import { CompanyControls } from "@/components/admin/company-controls";
import { getDb, schema, withoutPassword } from "@/lib/db";
import { Company360View } from "@/components/admin/company-360-view";
import { monthlyDues } from "@/lib/dues";
import { parseOffer } from "@/lib/offer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const db = getDb();
  const [company] = await db
    .select({ companyName: schema.employers.companyName })
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);

  return {
    title: company ? `${company.companyName} · Company 360` : "Company Not Found",
  };
}

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const session = await getSession();
  const viewAs = await canViewAs(session?.uid, session?.permissions);

  const [company] = await db
    .select(withoutPassword(getTableColumns(schema.employers)))
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);

  if (!company) {
    notFound();
  }

  // Fetch projects, proposals, interviews, payments in parallel
  const [projects, rawProposals, rawInterviews, payments] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.employerId, id))
      .orderBy(desc(schema.projects.createdAt)),
    db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.employerId, id))
      .orderBy(desc(schema.proposals.createdAt)),
    db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.employerId, id))
      .orderBy(desc(schema.interviews.createdAt)),
    db
      .select()
      .from(schema.employerPayments)
      .where(eq(schema.employerPayments.employerId, id))
      .orderBy(desc(schema.employerPayments.createdAt)),
  ]);

  // Collect intern IDs across proposals and interviews
  const internIds = Array.from(
    new Set([
      ...rawProposals.map((p) => p.internId),
      ...rawInterviews.map((i) => i.internId),
    ].filter(Boolean))
  );

  const internMap = new Map<string, typeof schema.users.$inferSelect>();
  if (internIds.length > 0) {
    const users = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.id, internIds));
    for (const u of users) {
      internMap.set(u.id, u);
    }
  }

  // Map project names
  const projectMap = new Map<string, string>();
  for (const p of projects) {
    projectMap.set(p.id, p.projectName);
  }

  // Augment proposals with intern info
  const proposals = rawProposals.map((prop) => {
    const intern = internMap.get(prop.internId);
    return {
      ...prop,
      internName: intern ? `${intern.firstName} ${intern.lastName}`.trim() : undefined,
      internEmail: intern?.email || undefined,
    };
  });

  // Augment interviews with intern info
  const interviews = rawInterviews.map((intv) => {
    const intern = internMap.get(intv.internId);
    return {
      ...intv,
      internName: intern ? `${intern.firstName} ${intern.lastName}`.trim() : undefined,
      internEmail: intern?.email || undefined,
    };
  });

  // Hired = status "hired" (paid for). "Accepted" is not yet a hire.
  const hiredProposals = rawProposals.filter(
    (p) => p.status === "hired"
  );

  const hiredInterns = hiredProposals.map((prop) => {
    const intern = internMap.get(prop.internId) || null;
    return {
      proposal: prop,
      intern,
      projectName: projectMap.get(prop.projectId) || "Assigned Project",
    };
  });

  const dues = monthlyDues(rawProposals, payments).map((d) => {
    const prop = rawProposals.find((p) => p.id === d.proposalId)!;
    const offer = parseOffer(prop.offerDetails, prop.currency);
    const intern = internMap.get(prop.internId);
    return {
      ...d,
      internName: intern ? `${intern.firstName} ${intern.lastName}`.trim() : "Intern",
      role: offer.roleTitle || "Internship",
      nextMinor: offer.monthlyMinor,
      currency: offer.currency,
    };
  });

  return (
    <Company360View
      company={company}
      projects={projects}
      proposals={proposals}
      interviews={interviews}
      payments={payments}
      dues={dues}
      hiredInterns={hiredInterns}
      actions={
        <>
          <ContactEditor
            targetType="employer"
            targetId={company.id}
            initial={{
              name: company.name,
              email: company.companyEmail,
              countryCode: company.countryCode,
              phoneNumber: company.phoneNumber,
            }}
          />
          {viewAs ? <ViewAsButton targetType="employer" targetId={company.id} label="View as company" /> : null}
          <CompanyControls id={company.id} isActive={company.isActive} fteStatus={company.internationalFteStatus} />
        </>
      }
    />
  );
}
