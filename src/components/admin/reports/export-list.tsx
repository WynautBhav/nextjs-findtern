import { Download } from "lucide-react";

import { Panel, PanelHeader } from "@/components/admin/panel";

export type ExportItem = { title: string; body: string; href: string };

/** CSV downloads as one quiet list: name and what is in it on the left, the action on the right. */
export function ExportList({ items }: { items: ExportItem[] }) {
  return (
    <Panel>
      <PanelHeader title="Raw data exports" description="CSV files for offline analysis. Each file has every row (up to 10,000), not just one page." />
      <ul className="mt-2 divide-y divide-[color:var(--admin-rule)] px-[var(--admin-pad-panel)] pb-2">
        {items.map((item) => (
          <li key={item.href} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="text-sm text-text-subtle">{item.body}</p>
            </div>
            <a
              href={item.href}
              aria-label={`Download ${item.title} as CSV`}
              className="apple-spring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
            >
              <Download className="size-4" aria-hidden />
              <span className="max-sm:sr-only">CSV</span>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
