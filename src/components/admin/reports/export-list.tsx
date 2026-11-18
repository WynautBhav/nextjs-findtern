import { Download } from "lucide-react";

import { RP_BUTTON } from "@/components/admin/money/rp-parts";
import { Section } from "@/components/app/stat";

export type ExportItem = { title: string; body: string; href: string; format?: "CSV" | "XLSX" };

/** The raw files as one ruled list: what is in it on the left, the download on the right. */
export function ExportList({ items }: { items: ExportItem[] }) {
  if (items.length === 0) return null;
  return (
    <Section title="Raw data exports" hint="CSV and Excel files for offline analysis. Each file has every row (up to 10,000), all time, not one page and not just the period picked above.">
      <ul className="divide-y divide-ink-200 border-b border-ink-200">
        {items.map((item) => {
          const format = item.format ?? "CSV";
          return (
            <li key={item.href} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{item.title}</p>
                <p className="text-sm text-ink-600">{item.body}</p>
              </div>
              <a href={item.href} aria-label={`Download ${item.title} as ${format}`} className={RP_BUTTON}>
                <Download className="size-4" aria-hidden />
                {format}
              </a>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
