import { hideContactText } from "../../lib/contact-scrub.ts";

/**
 * Free text from a candidate's profile (experience, certificates, activities)
 * as an employer may see it: a value carrying contact details is hidden whole
 * until the hire unmasks the candidate (partial masks leak; OA1, OA8).
 */
export function profileText(value: string, unlocked: boolean): string {
  return unlocked ? value : hideContactText(value);
}
