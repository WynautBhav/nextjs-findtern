/**
 * Listings refuse contact details (OA1): a project name is what candidates
 * read before any hire, so a phone, email, link or handle in it would get
 * round the paid hire. Pure, so the form and both project routes share it.
 */
import { findContact } from "./contact-scrub.ts";

const LABEL = { phone: "a phone number", email: "an email", url: "a link", handle: "a social handle" } as const;

export function projectContactError(text: string): string | null {
  const { kinds } = findContact(text);
  if (kinds.length === 0) return null;
  return `Take out ${LABEL[kinds[0]]}. Listings can't carry contact details; candidates get them after a paid hire.`;
}
