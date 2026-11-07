import { scrubContact } from "../../lib/contact-scrub.ts";

/**
 * Free text from a candidate's profile (experience, certificates, activities)
 * as an employer may see it: contact details hidden until the hire unmasks
 * the candidate, the same rule messages follow (OA1, OA8).
 */
export function profileText(value: string, unlocked: boolean): string {
  return unlocked ? value : scrubContact(value).text;
}
