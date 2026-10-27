import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq, getTableColumns, inArray } from "drizzle-orm";

import { ContactEditor } from "@/components/admin/contact-editor";
import { ViewAsButton } from "@/components/admin/view-as-button";
import { AdminLoadError, Panel } from "@/components/admin/panel";
import { Company360View, type Company360Tab } from "@/components/admin/company-360-view";
import { getSession } from "@/lib/auth";
import { canViewAs } from "@/lib/admin/impersonation";
import { flattenParams } from "@/lib/admin/params";
import { companyLedger } from "@/lib/admin/company-ledger";
import { getDb, schema, withoutPassword } from "@/lib/db";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const [company] = await getDb()
      .select({ companyName: schema.employers.companyName })
      .from(schema.employers)
      .where(eq(schema.employers.id, id))
      .limit(1);
    return { title: company ? `${company.companyName} · Company 360` : "Company not found" };
  } catch {
    return { title: "Company 360" };
  }
}

const TABS: Company360Tab[] = ["profile", "projects", "proposals", "interviews", "payments", "dues", "hired"];

async function load(id: string) {
  const db = getDb();
  const [company] = await db
    .select(withoutPassword(getTableColumns(schema.employers)))
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);
  if (!company) return null;

  const [projects, proposals, interviews, payments] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.employerId, id)).orderBy(desc(schema.projects.createdAt)),
    db.select().from(schema.proposals).where(eq(schema.proposals.employerId, id)).orderBy(desc(schema.proposals.createdAt)),
    db.select().from(schema.interviews).where(eq(schema.interviews.employerId, id)).orderBy(desc(schema.interviews.createdAt)),
    db.select().from(schema.employerPayments).where(eq(schema.employerPayments.employerId, id)).orderBy(desc(schema.employerPayments.createdAt)),
  ]);

  const internIds = [...new Set([...proposals.map((p) => p.internId), ...interviews.map((i) => i.internId)].filter(Boolean))];
  const [interns, onboarding] = internIds.length
    ? await Promise.all([
        db
          .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName, email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, internIds)),
        db
          .select({ userId: schema.internOnboarding.userId, extraData: schema.internOnboarding.extraData })
          .from(schema.internOnboarding)
          .where(inArray(schema.internOnboarding.userId, internIds)),
      ])
    : [[], []];

  return { company, projects, proposals, interviews, payments, interns, onboarding };
}

export default async function AdminCompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = flattenParams(await searchParams);
  const tab = (TABS as string[]).includes(query.tab ?? "") ? (query.tab as Company360Tab) : "profile";

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load(id);
  } catch (error) {
    console.error("[admin/companies/[id]]", error);
    return (
      <Panel>
        <AdminLoadError what="this company" retryHref={`/admin/companies/${id}`} />
      </Panel>
    );
  }
  if (!data) notFound();

  const session = await getSession();
  const viewAs = await canViewAs(session?.uid, session?.permissions);

  const scores = new Map(
    data.onboarding.map((r) => [r.userId, Number(((r.extraData ?? {}) as Record<string, unknown>).findternScore) || 0]),
  );
  const ledger = companyLedger(data.proposals, data.payments, (internId) => scores.get(internId) ?? 0);

  return (
    <Company360View
      tab={tab}
      params={query}
      company={data.company}
      projects={data.projects}
      proposals={data.proposals}
      interviews={data.interviews}
      payments={data.payments}
      interns={data.interns}
      ledger={ledger}
      actions={
        <>
          <ContactEditor
            targetType="employer"
            targetId={data.company.id}
            initial={{
              name: data.company.name,
              email: data.company.companyEmail,
              countryCode: data.company.countryCode,
              phoneNumber: data.company.phoneNumber,
            }}
          />
          {viewAs ? <ViewAsButton targetType="employer" targetId={data.company.id} label="View as company" /> : null}
        </>
      }
    />
  );
}
