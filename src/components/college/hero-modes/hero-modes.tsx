"use client";

import { useState } from "react";

import type { MasterRow } from "@/lib/college/master-row";
import type { OverviewModes } from "@/lib/college/overview-modes";
import { DrillProvider } from "./drill";
import { cn } from "@/lib/utils";
import { CATEGORY_DESIGNS } from "./categories";
import { PLACEMENT_DESIGNS } from "./placement";

/**
 * The Overview hero in three modes: Students (the campus walk, rendered on the server and passed in), Categories
 * analysis and Placement analysis. While the designs are compared, each new mode has a design picker; the choice
 * is kept in the address (?mode=&design=) so a link opens the same design.
 */

export type HeroMode = "students" | "categories" | "placement";
const MODES: { id: HeroMode; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "categories", label: "Categories analysis" },
  { id: "placement", label: "Placement analysis" },
];

export function HeroModes({ students, data, initialMode, initialDesign, rows, collegeId, now }: { students: React.ReactNode; data: OverviewModes; initialMode: HeroMode; initialDesign: number; rows: MasterRow[]; collegeId: string; now: number }) {
  const [mode, setMode] = useState<HeroMode>(initialMode);
  const [design, setDesign] = useState<Record<"categories" | "placement", number>>({
    categories: initialMode === "categories" ? initialDesign : 0,
    placement: initialMode === "placement" ? initialDesign : 0,
  });
  const sync = (m: HeroMode, d: number) => {
    const url = new URL(window.location.href);
    if (m === "students") {
      url.searchParams.delete("mode");
      url.searchParams.delete("design");
    } else {
      url.searchParams.set("mode", m);
      url.searchParams.set("design", String(d + 1));
    }
    window.history.replaceState(null, "", url);
  };
  const list = mode === "categories" ? CATEGORY_DESIGNS : mode === "placement" ? PLACEMENT_DESIGNS : [];
  const current = mode === "students" ? 0 : Math.min(design[mode], list.length - 1);

  return (
    <DrillProvider rows={rows} collegeId={collegeId} now={now}>
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Dashboard mode" className="flex flex-wrap gap-1 rounded-full bg-white/10 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => {
                setMode(m.id);
                sync(m.id, m.id === "students" ? 0 : design[m.id]);
              }}
              className={cn(
                "min-h-9 rounded-full px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/80",
                mode === m.id ? "bg-white text-brand-900" : "text-white/80 hover:bg-white/10 hover:text-white",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode !== "students" && list.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Compare designs">
            <span className="mr-1 text-xs text-on-dark-subtle">Design</span>
            {list.map((d, i) => (
              <button
                key={d.name}
                type="button"
                aria-pressed={current === i}
                title={d.name}
                aria-label={`Design ${i + 1}: ${d.name}`}
                onClick={() => {
                  setDesign((s) => ({ ...s, [mode]: i }));
                  sync(mode, i);
                }}
                className={cn(
                  "nums grid size-8 place-items-center rounded-full text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                  current === i ? "bg-accent-400 text-brand-950" : "bg-white/10 text-white hover:bg-white/20",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {mode !== "students" && list.length > 1 ? <p className="mt-2 text-right text-xs text-on-dark-subtle">{list[current].name}</p> : null}

      <div role="tabpanel" aria-label={MODES.find((m) => m.id === mode)?.label}>
        {mode === "students" ? students : mode === "categories" ? (() => { const C = CATEGORY_DESIGNS[current].Component; return <C data={data.categories} />; })() : (() => { const C = PLACEMENT_DESIGNS[current].Component; return <C data={data.placement} />; })()}
      </div>
    </div>
    </DrillProvider>
  );
}
