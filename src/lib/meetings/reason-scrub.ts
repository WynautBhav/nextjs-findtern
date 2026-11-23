import { denyTermsFor, scrubOutgoing } from "../contact-scrub.ts";

/**
 * A cancel reason is read by the other side, so before the hire is paid it carries no contact detail and no name that
 * would let the two sides reach each other off Findtern: they are replaced in place and the rest of the reason stays.
 * After the hire everything is shared, so the reason is kept as written.
 */
export function scrubMeetingReason(
  reason: string,
  o: { hired: boolean; company?: string | null; employerNames?: (string | null | undefined)[]; internFirst?: string | null; internLast?: string | null; companyWebsite?: string | null; companyEmail?: string | null },
): string {
  if (o.hired) return reason;
  return scrubOutgoing(reason, denyTermsFor(o)).text;
}
