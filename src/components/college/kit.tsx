import { avatarTint } from "@/components/app/avatar-helpers";
import { HeroPanel } from "@/components/employer/kit/hero-panel";
import { initialsOf } from "@/lib/college/labels";
import { cn } from "@/lib/utils";

/**
 * The placement console's own look, shared by every college page: one dark green hero that names the page and
 * carries its headline figures and its one drawing, then white work surfaces below. Server-safe (no hooks); every
 * figure and drawing is fed by the page from the college's real rows. Motion is CSS behind prefers-reduced-motion.
 */

export function CollegeHero({
  title,
  lede,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  /** Figures and the page's drawing, under the title. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <HeroPanel className={cn("rise", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-balance text-[clamp(1.75rem,3.4vw,2.5rem)] font-light leading-tight tracking-[-0.03em]">{title}</h1>
          {lede ? <p className="mt-1.5 text-pretty text-sm leading-relaxed text-on-dark">{lede}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap gap-2.5 sm:w-auto">{actions}</div> : null}
      </div>
      {children}
    </HeroPanel>
  );
}

/** Figures in a hero: 2 across on a phone, all in one row from `lg`. */
export function HeroStats({ children, cols = 4, className }: { children: React.ReactNode; cols?: 3 | 4; className?: string }) {
  return <dl className={cn("mt-8 grid grid-cols-2 gap-x-6 gap-y-6", cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3", className)}>{children}</dl>;
}

export function HeroStat({ label, value, hint, lead = false }: { label: string; value: React.ReactNode; hint?: React.ReactNode; lead?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-medium text-on-dark">{label}</dt>
      <dd>
        <span className={cn("nums mt-1.5 block break-words font-light leading-none tracking-[-0.04em]", lead ? "text-[clamp(2.5rem,5.4vw,4rem)]" : "text-[clamp(2rem,4vw,2.75rem)]")}>{value}</span>
        {hint ? <span className="mt-2 block text-xs text-on-dark">{hint}</span> : null}
      </dd>
    </div>
  );
}

/** A person's initials on their own steady tint (the same student is the same colour on every page). */
export function Initials({ seed, name, className }: { seed: string; name: string; className?: string }) {
  const letters = initialsOf(name);
  return (
    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", avatarTint(seed), className)}>
      {letters}
    </span>
  );
}

export type Segment = { label: string; value: number; className: string; dot?: string; /** The label already says the figure (money). */ hideValue?: boolean };

/** One bar split into named parts, with the legend under it. On the hero by default (`tone="dark"`). */
export function SplitBar({ segments, label, tone = "dark", className }: { segments: Segment[]; label: string; tone?: "dark" | "light"; className?: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const dark = tone === "dark";
  return (
    <div className={className}>
      <div role="img" aria-label={`${label}: ${segments.map((s) => (s.hideValue ? s.label : `${s.value} ${s.label}`)).join(", ")}`} className={cn("flex h-3.5 gap-[3px] overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-ink-100")}>
        {segments.map((s, i) =>
          s.value > 0 ? (
            <span key={s.label} className={cn("bar-slide block h-full origin-left first:rounded-l-full last:rounded-r-full", s.className)} style={{ width: `${(s.value / total) * 100}%`, animationDelay: `${i * 90}ms` }} />
          ) : null,
        )}
      </div>
      <ul className={cn("mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm", dark ? "text-on-dark" : "text-ink-600")}>
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2 rounded-full", s.dot ?? s.className)} />
            {s.hideValue ? null : <span className={cn("nums font-semibold", dark ? "text-white" : "text-ink-900")}>{s.value.toLocaleString("en-IN")}</span>}
            <span className={cn(s.hideValue && (dark ? "text-white" : "text-ink-900"))}>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DOT_COLS = 40; // a quarter of a point each, 0 to 10
const DOT_ROWS = 9;

/**
 * Every interviewed student as a dot on the 0 to 10 score line: gold from 8, white from 6, faint below. With a
 * large batch one dot stands for several students (the caption says how many), so the picture never outgrows the hero.
 */
export function ScoreDots({ scores, className }: { scores: number[]; className?: string }) {
  const counts = Array.from({ length: DOT_COLS }, () => 0);
  for (const s of scores) counts[Math.min(DOT_COLS - 1, Math.max(0, Math.floor(s * 4)))]++;
  const peak = Math.max(1, ...counts);
  const per = Math.ceil(peak / DOT_ROWS);
  const tone = (i: number) => (i >= 32 ? "bg-accent-400" : i >= 24 ? "bg-white/85" : "bg-white/35");
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Findtern scores of ${scores.length} interviewed students: ${scores.filter((s) => s >= 8).length} at 8 or above, ${scores.filter((s) => s >= 6 && s < 8).length} from 6 to 8, ${scores.filter((s) => s < 6).length} below 6.`}
        className="flex h-28 items-end gap-[3px] border-b border-white/20 pb-1.5"
      >
        {counts.map((c, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col-reverse items-center gap-[3px]">
            {Array.from({ length: Math.ceil(c / per) }, (_, d) => (
              <span key={d} className={cn("dot-pop aspect-square w-full max-w-2 rounded-full", tone(i))} style={{ animationDelay: `${i * 14 + d * 30}ms` }} />
            ))}
          </div>
        ))}
      </div>
      <div aria-hidden className="nums mt-1.5 flex justify-between text-[11px] text-on-dark">
        {[0, 2, 4, 6, 8, 10].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-on-dark">
        <span>{per === 1 ? "One dot is one student" : `One dot is ${per} students`}, placed at their Findtern score.</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-accent-400" /> 8 and above</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-white/85" /> 6 to 8</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-white/35" /> below 6</span>
      </p>
    </div>
  );
}

/**
 * A half-circle gauge: how much of something is used. The arc is one stroked path whose dash length is the share,
 * so it needs no trigonometry and scales with its box.
 */
export function ArcGauge({ used, total, label, className }: { used: number; total: number; label: string; className?: string }) {
  const share = total > 0 ? Math.min(1, used / total) : 0;
  const len = Math.PI * 80; // half circumference at r=80
  return (
    <div className={cn("relative w-full max-w-[17rem]", className)} role="img" aria-label={`${used} of ${total} ${label}`}>
      <svg viewBox="0 0 200 112" className="block w-full">
        <path d="M20,100 A80,80 0 0 1 180,100" fill="none" className="stroke-white/15" strokeWidth="14" strokeLinecap="round" />
        <path d="M20,100 A80,80 0 0 1 180,100" fill="none" className="arc-draw stroke-accent-400" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${share * len} ${len}`} style={{ ["--arc-len" as string]: `${len}` }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="nums text-[2.5rem] font-light leading-none tracking-[-0.04em]">{used.toLocaleString("en-IN")}</p>
        <p className="mt-1 text-xs text-on-dark">of {total.toLocaleString("en-IN")} {label}</p>
      </div>
    </div>
  );
}

/** A drive's window as a line from open to close with "now" on it. `share` is 0 to 1; null when it has no "now" (not open yet, or over). */
export function WindowLine({ share, state }: { share: number | null; state: "upcoming" | "live" | "ended" | "revoked" }) {
  const done = state === "ended" || state === "revoked";
  return (
    <div aria-hidden className="relative h-1.5 rounded-full bg-ink-100">
      <div className={cn("bar-slide absolute inset-y-0 left-0 origin-left rounded-full", done ? "bg-ink-300" : "bg-brand-600")} style={{ width: `${done ? 100 : (share ?? 0) * 100}%` }} />
      {state === "live" && share !== null ? (
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent-500 shadow-sm" style={{ left: `${share * 100}%` }} />
      ) : null}
    </div>
  );
}
