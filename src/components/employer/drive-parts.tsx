import { GraduationCap } from "lucide-react";

import { Pill, type Tone } from "@/components/app/primitives";
import { Logo } from "@/components/brand/logo";
import type { DriveWindow } from "@/lib/college/access";
import { formatSlotTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shared bits for the campus drive screens (public landing + employer
 * workspace). Server-safe: no hooks.
 */

const STATE: Record<DriveWindow, { tone: Tone; label: string }> = {
  live: { tone: "live", label: "Live now" },
  upcoming: { tone: "waiting", label: "Opens soon" },
  ended: { tone: "closed", label: "Ended" },
  revoked: { tone: "closed", label: "Closed by the college" },
};

/**
 * The one drive-state pill for both sides (college and employer used
 * different words and tones). `audience="college"` words a revoked drive
 * from the side that closed it. Static dot: the ping looped for the whole
 * drive.
 */
export function DriveStatePill({ state, audience = "employer" }: { state: DriveWindow; audience?: "employer" | "college" }) {
  const s = STATE[state];
  return (
    <Pill tone={s.tone}>
      {state === "live" ? <span aria-hidden className="size-1.5 rounded-full bg-brand-600" /> : null}
      {audience === "college" && state === "revoked" ? "Link closed" : s.label}
    </Pill>
  );
}

export const KIND_LABEL: Record<string, string> = {
  internship: "Internship drive",
  full_time: "Full-time drive",
};

export function driveTime(d: Date): string {
  return formatSlotTime(d, "Asia/Kolkata");
}

/** "3 days left", "5 hours left", from real dates only. */
export function timeLeft(endsAt: Date, now = Date.now()): string | null {
  const ms = endsAt.getTime() - now;
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} min left`;
}

/** College mark next to Findtern's: the college's logo when it has one, else its initials. */
export function CollegeMark({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|&)$/i.test(w))
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt={name} className={cn("size-12 rounded-xl border border-ink-200 bg-white object-contain p-1", className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-xl bg-brand-950 text-sm font-bold tracking-wide text-white",
        className,
      )}
    >
      {initials || <GraduationCap className="size-5" />}
    </span>
  );
}

export function CoBrand({ collegeName }: { collegeName: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-ink-600">
      <span className="truncate">{collegeName}</span>
      <span aria-hidden className="text-ink-300">
        ×
      </span>
      <Logo className="h-4" alt="Findtern" />
    </div>
  );
}
