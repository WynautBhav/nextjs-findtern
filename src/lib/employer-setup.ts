import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { getDb, schema } from "./db";
import { missingCompanyFields } from "./employer-onboarding";
import { isAdminViewing } from "./employer-visibility";
import { gated } from "./request-gate";

/**
 * Where an employer still has to go before the hiring screens make sense:
 * the company profile first, then at least one project (a shortlist, a
 * proposal and the "matches" list are all keyed on a project). `null` once
 * both exist.
 */
export async function employerSetupStep(employerId: string): Promise<"company" | "project" | null> {
  const db = getDb();
  // Independent reads, started together (the project one is simply unused when the company step is unfinished).
  const [[employer], [project]] = await Promise.all([
    gated(() => db.select().from(schema.employers).where(eq(schema.employers.id, employerId)).limit(1)),
    gated(() => db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.employerId, employerId)).limit(1)),
  ]);
  if (!employer || missingCompanyFields(employer).length > 0) return "company";
  return project ? null : "project";
}

/**
 * Send an employer who skipped setup back to onboarding. Signup already lands
 * on `/employer/onboarding`, but login, the sidebar and a typed URL all went
 * straight to the dashboard with no company profile and no project.
 *
 * An admin "View as" is never bounced - they are looking, not setting up. A
 * failed lookup does not bounce either; the page renders its own error state.
 */
export async function requireEmployerSetup(employerId: string): Promise<void> {
  if (await isAdminViewing()) return;
  let step: Awaited<ReturnType<typeof employerSetupStep>> = null;
  try {
    step = await employerSetupStep(employerId);
  } catch {
    return;
  }
  if (step === "company") redirect("/employer/onboarding");
  if (step === "project") redirect("/employer/onboarding?stage=project");
}
