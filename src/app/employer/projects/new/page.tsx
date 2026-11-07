import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { ProjectEditor } from "@/components/employer/project-editor";
import { timezoneForLocation } from "@/lib/timezones";
import { projectCompany } from "../_company";

export const metadata: Metadata = {
  title: "Post a project",
  robots: { index: false, follow: false },
};

export default async function NewProjectPage() {
  const session = await requireRole("employer");
  const company = await projectCompany(session.uid);
  return (
    <ProjectEditor
      employerId={session.uid}
      defaultTimezone={timezoneForLocation(company ?? {})}
      companyName={company?.companyName}
      companyPlace={company ? { city: company.city, state: company.state } : undefined}
    />
  );
}
