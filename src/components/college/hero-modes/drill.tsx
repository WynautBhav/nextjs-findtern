"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MasterDataTable } from "@/components/college/master-data-table";
import type { MasterRow } from "@/lib/college/master-row";

/**
 * Drill-down from the Overview hero: a number opens Master data in a pop-up on the same page, filters already set,
 * with every Master data action (filters, columns, saved views, CSV download). The number stays a real link to
 * /college/master-data, so a new-tab click or a browser without script still gets there.
 */

export type DrillFilters = { course?: string; year?: number; band?: string; marks?: string };
type Drill = { title: string; filters: DrillFilters };

const DrillContext = createContext<((d: Drill) => void) | null>(null);

/** The Master data address for a set of filters. Verified only: the hero counts verified students. */
export function drillHref(f: DrillFilters) {
  const q = new URLSearchParams({ status: "verified" });
  if (f.course) q.set("course", f.course === "Not set" ? "Course not set" : f.course);
  if (f.year) q.set("year", String(f.year));
  if (f.band) q.set("band", f.band);
  if (f.marks) q.set("marks", f.marks);
  return `/college/master-data?${q}`;
}

/** onClick for a drill link: a plain click opens the pop-up; Ctrl, Cmd, Shift or a middle click keep the link. */
export function useDrill(title: string, filters: DrillFilters) {
  const open = useContext(DrillContext);
  return (e: React.MouseEvent) => {
    if (!open || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open({ title, filters });
  };
}

export function DrillProvider({ rows, collegeId, now, children }: { rows: MasterRow[]; collegeId: string; now: number; children: React.ReactNode }) {
  const [drill, setDrill] = useState<Drill | null>(null);
  const key = drill ? JSON.stringify(drill.filters) : "";
  return (
    <DrillContext.Provider value={setDrill}>
      {children}
      <Dialog open={drill !== null} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <DialogContent onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="drill-panel flex h-[calc(100dvh-2rem)] w-[min(76rem,calc(100%-2rem))] max-w-none flex-col gap-4 overflow-hidden bg-ink-50 p-4 sm:max-w-none sm:p-6">
          {drill ? (
            <>
              <header className="drill-step mx-auto max-w-2xl px-10 text-center" style={{ "--i": 0 } as React.CSSProperties}>
                <DialogTitle className="text-xl font-semibold tracking-[-0.02em] text-ink-900 text-balance">{drill.title}</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-ink-600 text-pretty">
                  Master data with these filters set. Change anything, save a view or download.{" "}
                  <Link href={drillHref(drill.filters)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500">
                    Open full page <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                </DialogDescription>
              </header>
              <div className="drill-step min-h-0 flex-1" style={{ "--i": 1 } as React.CSSProperties}>
                <MasterDataTable
                  key={key}
                  embedded
                  rows={rows}
                  collegeId={collegeId}
                  now={now}
                  downloadName={drill.title}
                  initial={{ course: drill.filters.course === "Not set" ? "Course not set" : drill.filters.course, year: drill.filters.year ? String(drill.filters.year) : undefined, band: drill.filters.band, marks: drill.filters.marks, status: "verified" }}
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </DrillContext.Provider>
  );
}

/** A number in the hero that drills down: a real link to Master data, opened in the pop-up on a plain click. */
export function DrillLink({ title, filters, className, children, ...rest }: { title: string; filters: DrillFilters; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, "href" | "onClick" | "className" | "children">) {
  const onClick = useDrill(title, filters);
  return (
    <Link href={drillHref(filters)} onClick={onClick} className={className} {...rest}>
      {children}
    </Link>
  );
}
