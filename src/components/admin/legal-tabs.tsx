import { FilterTabs } from "@/components/app/primitives";

/** The four legal texts, one sidebar item ("Legal texts") with tabs between them. */
export const LEGAL_PAGES = [
  { key: "/admin/cms/terms", label: "Website terms" },
  { key: "/admin/companies/terms", label: "Company terms" },
  { key: "/admin/interns/terms", label: "Intern terms" },
  { key: "/admin/interns/non-disclosure", label: "Intern NDA" },
] as const;

export function LegalTabs({ current }: { current: (typeof LEGAL_PAGES)[number]["key"] }) {
  return <FilterTabs label="Legal texts" tabs={[...LEGAL_PAGES]} value={current} hrefFor={(k) => k} />;
}
