/**
 * When does "add a college" refuse a name clash? AISHE is the real unique key (its index decides), and many real
 * colleges share a name and have no city on file, so a name alone proves nothing.
 *  - AISHE code given: no name check.
 *  - City given: same name and city is the same college.
 *  - No city, no AISHE: only an identical payload (name, GSTIN, email domains) counts, which is what a double click makes.
 */
export type DuplicateProbe = { nameKey: string; cityKey: string; payload: { gstin: string; domains: string[] } | null };

export function duplicateProbe(d: { name: string; city: string; aisheCode?: string; gstin?: string; emailDomains: string[] }): DuplicateProbe | null {
  if (d.aisheCode) return null;
  const nameKey = d.name.toLowerCase().replace(/\s+/g, " ");
  const cityKey = d.city.toLowerCase();
  return { nameKey, cityKey, payload: cityKey ? null : { gstin: d.gstin ?? "", domains: d.emailDomains } };
}
