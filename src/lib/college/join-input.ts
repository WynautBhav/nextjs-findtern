/** Branch is required when a student joins a college (up to 120 characters). */
export const BRANCH_MAX = 120;
export const BRANCH_MESSAGE = "Enter your branch";

export function branchProblem(branch: string | null | undefined): string | null {
  const t = (branch ?? "").trim();
  return t.length === 0 || t.length > BRANCH_MAX ? BRANCH_MESSAGE : null;
}
