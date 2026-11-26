import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("en-IN");
const time = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export type PipelineStage = { key: "all" | "called" | "offers" | "hired"; label: string; value: number };

/**
 * The drive as one flow on the hero: students in the drive, then those an employer called, offered and hired. Each
 * bar is the stage's share of the drive's students; each stage opens its students on the board below.
 */
export function DrivePipeline({ driveId, stages, open }: { driveId: string; stages: PipelineStage[]; open: boolean }) {
  const base = stages[0]?.value ?? 0;
  return (
    <ol className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4 lg:gap-x-0" aria-label="Drive pipeline">
      {stages.map((s, i) => {
        const share = pct(s.value, base);
        const last = i === stages.length - 1;
        const body = (
          <>
            <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-on-dark">
              {s.label}
              {i > 0 ? <span className="nums text-xs font-normal">{share}%</span> : null}
            </span>
            <span className={cn("nums mt-2 block font-light leading-none tracking-[-0.04em]", i === 0 ? "text-[clamp(2.5rem,5vw,3.75rem)]" : "text-[clamp(2rem,4vw,3rem)]", last && s.value > 0 ? "text-accent-300" : "text-white")}>
              {n(s.value)}
            </span>
            {/* The stage's share of the drive's students, on one shared scale. */}
            <span aria-hidden className="mt-3 block h-2 overflow-hidden rounded-full bg-white/10">
              <span className={cn("block h-full rounded-full", last ? "bg-accent-400" : "bg-white/85")} style={{ width: `${i === 0 ? 100 : Math.max(s.value ? 2 : 0, share)}%` }} />
            </span>
          </>
        );
        return (
          <li key={s.key} className="relative min-w-0 lg:pr-8">
            {i > 0 ? <ChevronRight aria-hidden className="absolute -left-1 top-0 hidden size-4 -translate-x-full text-white/40 lg:block" /> : null}
            {open && s.key !== "all" ? (
              <Link href={`/college/drives/${driveId}?show=${s.key}#board`} className="block rounded-xl p-2 -m-2 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70">
                {body}
              </Link>
            ) : (
              <div className="p-2 -m-2">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Employer arrivals: the drive's window as a line, each company that came as a dot at the moment it opened the
 * link, "now" marked, and the invited companies still missing as hollow dots after the line.
 */
export function EmployerArrivals({ start, end, now, arrivals, missing, clickable = false }: { start: Date; end: Date; now: number; arrivals: { id: string; company: string; at: Date }[]; missing: string[]; /** Names and dots become buttons carrying data-company; the parent opens that company. */ clickable?: boolean }) {
  const span = Math.max(1, end.getTime() - start.getTime());
  const at = (d: Date | number) => Math.min(100, Math.max(0, ((typeof d === "number" ? d : d.getTime()) - start.getTime()) / span * 100));
  const nowAt = at(now);
  // Dots closer than 4% of the line stack upward, so two companies joining together stay two dots.
  const placed: { id: string; company: string; at: Date; x: number; row: number }[] = [];
  for (const a of [...arrivals].sort((p, q) => p.at.getTime() - q.at.getTime())) {
    const x = at(a.at);
    const row = placed.filter((p) => Math.abs(p.x - x) < 4).length;
    placed.push({ ...a, x, row: Math.min(row, 3) });
  }
  return (
    <figure aria-label={`${arrivals.length} ${arrivals.length === 1 ? "company" : "companies"} came in${missing.length ? `, ${missing.length} invited not yet` : ""}`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] font-medium text-on-dark">
        <span>Employers arriving</span>
        <span className="nums text-xs font-normal">
          <span className="text-white">{arrivals.length}</span> came{missing.length ? <> · <span className="text-accent-300">{missing.length}</span> invited not yet</> : null}
        </span>
      </figcaption>
      <div className="mt-3 flex items-end gap-4">
        <div className="relative h-16 min-w-0 flex-1">
          <span aria-hidden className="absolute inset-x-0 bottom-3 h-px bg-white/25" />
          <span aria-hidden className="absolute bottom-3 left-0 h-px bg-white/70" style={{ width: `${nowAt}%` }} />
          {nowAt > 0 && nowAt < 100 ? (
            <span aria-hidden className="absolute bottom-0 top-1 w-px bg-accent-400" style={{ left: `${nowAt}%` }}>
              <span className="absolute -top-1 left-1.5 text-[11px] font-medium text-accent-300">now</span>
            </span>
          ) : null}
          {placed.map((p) =>
            clickable ? (
              <button
                key={p.id}
                type="button"
                data-company={p.id}
                aria-haspopup="dialog"
                aria-label={`${p.company}, came ${time(p.at)}`}
                title={`${p.company} · ${time(p.at)}`}
                className="absolute size-3 -translate-x-1/2 rounded-full bg-white ring-[3px] ring-brand-900 outline-none before:absolute before:-inset-2 before:content-[''] hover:ring-accent-400 focus-visible:ring-white/80"
                style={{ left: `${p.x}%`, bottom: `${6 + p.row * 13}px` }}
              />
            ) : (
              <span
                key={p.id}
                title={`${p.company} · ${time(p.at)}`}
                className="absolute size-3 -translate-x-1/2 rounded-full bg-white ring-[3px] ring-brand-900"
                style={{ left: `${p.x}%`, bottom: `${6 + p.row * 13}px` }}
              />
            ),
          )}
        </div>
        {missing.length ? (
          <span className="flex shrink-0 items-center gap-1 pb-1.5" aria-hidden>
            {missing.slice(0, 6).map((m) => (
              <span key={m} title={`${m}: invited, not here yet`} className="size-3 rounded-full border-2 border-accent-300/80" />
            ))}
          </span>
        ) : null}
      </div>
      <p className="nums mt-1 flex justify-between text-[11px] text-on-dark">
        <span>{time(start)}</span>
        <span>{time(end)}</span>
      </p>
      {arrivals.length ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/85">
          {[...arrivals].sort((p, q) => p.at.getTime() - q.at.getTime()).slice(0, 6).map((a) => (
            <li key={a.id}>
              {clickable ? (
                <button type="button" data-company={a.id} aria-haspopup="dialog" className="flex min-h-9 items-center gap-1.5 rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/80">
                  <span aria-hidden className="size-1.5 rounded-full bg-white" />
                  {a.company} <span className="nums text-on-dark">{time(a.at)}</span>
                </button>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-1.5 rounded-full bg-white" />
                  {a.company} <span className="nums text-on-dark">{time(a.at)}</span>
                </span>
              )}
            </li>
          ))}
          {arrivals.length > 6 ? <li className="text-on-dark">+{arrivals.length - 6} more below</li> : null}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-on-dark">No company has opened the link yet.</p>
      )}
    </figure>
  );
}

export type SpreadRow = { label: string; inDrive: number; offered: number; hired: number };

/**
 * Offers by branch and by year: each row's track is its students in the drive, the light fill those offered and the
 * dark fill those hired. Branches share one scale and years another, so a big branch reads big against its peers.
 */
export function DriveSpread({ branches, years }: { branches: SpreadRow[]; years: SpreadRow[] }) {
  const scale = (rows: SpreadRow[]) => Math.max(1, ...rows.map((r) => r.inDrive));
  const renderRow = (r: SpreadRow, max: number) => (
    <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2 max-sm:grid-cols-[minmax(0,1fr)_auto]">
      <span className="truncate text-sm text-ink-800">{r.label}</span>
      <span aria-hidden className="relative h-3 overflow-hidden rounded-full max-sm:col-span-2 max-sm:row-start-2" style={{ width: `${Math.max(8, (r.inDrive / max) * 100)}%` }}>
        <span className="absolute inset-0 rounded-full bg-ink-100" />
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand-300" style={{ width: `${pct(r.offered, r.inDrive)}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand-700" style={{ width: `${pct(r.hired, r.inDrive)}%` }} />
      </span>
      <span className="nums whitespace-nowrap text-right text-sm text-ink-700">
        <span className="font-medium text-ink-900">{n(r.offered)}</span> offered · <span className="font-medium text-ink-900">{n(r.hired)}</span> hired
        <span className="text-text-subtle"> of {n(r.inDrive)}</span>
      </span>
    </li>
  );
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 rounded-full bg-ink-100" /> In the drive</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 rounded-full bg-brand-300" /> Offered</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 rounded-full bg-brand-700" /> Hired</span>
      </p>
      <div className="mt-3 grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="By branch">
          <h3 className="text-sm font-semibold text-ink-900">By branch</h3>
          <ul className="mt-1 divide-y divide-ink-100">{branches.map((r) => renderRow(r, scale(branches)))}</ul>
        </section>
        <section aria-label="By year">
          <h3 className="text-sm font-semibold text-ink-900">By year</h3>
          <ul className="mt-1 divide-y divide-ink-100">{years.map((r) => renderRow(r, scale(years)))}</ul>
        </section>
      </div>
    </div>
  );
}
