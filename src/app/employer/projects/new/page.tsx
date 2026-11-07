import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { timezoneForLocation } from "@/lib/timezones";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "Post an internship", robots: { index: false, follow: false } };

export default async function NewProjectPage() {
  const session = await requireRole("employer");
  const [company] = await getDb()
    .select({ companyName: schema.employers.companyName, country: schema.employers.country, state: schema.employers.state, city: schema.employers.city })
    .from(schema.employers)
    .where(eq(schema.employers.id, session.uid))
    .limit(1);
  return (
    <div className="container-page section-y space-y-6">
      <PageHeader title="Post an internship" subtitle="Save a draft any time. Submit when the checklist is complete." />
      <ProjectForm
        employerId={session.uid}
        companyName={company?.companyName}
        companyPlace={company ? { city: company.city, state: company.state } : undefined}
        defaultTimezone={timezoneForLocation(company ?? {})}
      />
    </div>
  );
}
