"use client";

import { ChevronDown, Search } from "lucide-react";

import { fieldClass } from "@/components/employer/ui-tokens";
import { cn } from "@/lib/utils";

export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldClass, "appearance-none pr-9")}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
    </label>
  );
}


export type DriveFilters = {
  q: string;
  minScore: number;
  year: number;
  branch: string;
  onlyShortlisted: boolean;
  onlyOnline: boolean;
};

/** Sticky, glass filter bar for the drive list. */
export function FilterBar({
  f,
  patch,
  years,
  branches,
  shortlistCount,
  onlineCount,
  shown,
  total,
  active,
  onClear,
  yearLabel,
}: {
  f: DriveFilters;
  patch: (p: Partial<DriveFilters>) => void;
  years: number[];
  branches: string[];
  shortlistCount: number;
  onlineCount: number;
  shown: number;
  total: number;
  active: boolean;
  onClear: () => void;
  yearLabel: (y: number) => string;
}) {
  return (
    <div className="rounded-[24px] border border-ink-200/70 bg-white/85 p-4 shadow-tile backdrop-blur-md lg:sticky lg:top-3 lg:z-10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <label className="relative block">
          <span className="sr-only">Search skills or branch</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
          <input
            type="search"
            value={f.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Skill or branch, e.g. React"
            className={cn(fieldClass, "pl-9")}
          />
        </label>
        <Select label="Minimum score" value={String(f.minScore)} onChange={(v) => patch({ minScore: Number(v) })}>
          <option value="0">Any score</option>
          {[5, 6, 7, 8].map((s) => (
            <option key={s} value={s}>
              {s}+ score
            </option>
          ))}
        </Select>
        <Select label="Year" value={String(f.year)} onChange={(v) => patch({ year: Number(v) })}>
          <option value="0">Any year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {yearLabel(y)}
            </option>
          ))}
        </Select>
        <Select label="Branch" value={f.branch} onChange={(v) => patch({ branch: v })}>
          <option value="">Any branch</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-700">
          <input
            type="checkbox"
            checked={f.onlyShortlisted}
            onChange={(e) => patch({ onlyShortlisted: e.target.checked })}
            className="size-4 rounded border-ink-300 accent-brand-700"
          />
          Shortlisted only ({shortlistCount})
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-700">
          <input
            type="checkbox"
            checked={f.onlyOnline}
            onChange={(e) => patch({ onlyOnline: e.target.checked })}
            className="size-4 rounded border-ink-300 accent-brand-700"
          />
          Online now ({onlineCount})
        </label>
        <p className="nums text-sm text-ink-600" aria-live="polite">
          Showing {shown} of {total} students
          {active ? (
            <button
              type="button"
              onClick={onClear}
              className="ml-2 inline-flex min-h-11 items-center font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </p>
      </div>
    </div>
  );
}
