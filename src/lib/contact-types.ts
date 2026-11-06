/** The enquiry types on /contact. Shared by the form, the API schema and the `?type=` link. */
export const CONTACT_TYPES = ["general", "hiring", "intern", "college"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const COLLEGE_CONTACT_HREF = "/contact?type=college";

/** `/contact?type=college` preselects the type; anything unknown falls back to "general". */
export function parseQueryType(raw: string | string[] | null | undefined): ContactType {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  return CONTACT_TYPES.find((t) => t === v) ?? "general";
}
