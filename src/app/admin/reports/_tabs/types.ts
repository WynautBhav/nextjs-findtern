import type { ReportWindow } from "@/lib/admin/reports/window";

/** What every tab receives from the shell. `params` is the flattened query (tab, range, period, from, to and each table's own keys). */
export type TabProps = { window: ReportWindow; params: Record<string, string>; now: Date };
