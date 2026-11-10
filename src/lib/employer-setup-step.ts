import { missingCompanyFields } from "./employer-onboarding.ts";

type CompanyRow = Parameters<typeof missingCompanyFields>[0];

/**
 * The setup step from the two reads `employerSetupStep` starts together: the company row and (only
 * needed once the company step is done) the employer's first project.
 *
 * An employer with an incomplete company profile goes to onboarding whatever happened to the project
 * read: that read is not consulted until the company is complete, which is how this behaved when the
 * reads ran one after the other. A failed company read, or a failed project read for a complete company,
 * throws - the caller (requireEmployerSetup) then leaves the page to show its own error state.
 */
export function setupStepFrom(
  employerRes: PromiseSettledResult<CompanyRow[]>,
  projectRes: PromiseSettledResult<unknown[]>,
): "company" | "project" | null {
  if (employerRes.status === "rejected") throw employerRes.reason;
  const [employer] = employerRes.value;
  if (!employer || missingCompanyFields(employer).length > 0) return "company";
  if (projectRes.status === "rejected") throw projectRes.reason;
  return projectRes.value.length > 0 ? null : "project";
}
