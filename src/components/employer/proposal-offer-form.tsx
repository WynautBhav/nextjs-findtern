"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { PAID_LEAVE_OPTIONS, scheduledMonthlyHours, WEEKLY_SCHEDULES, weeklyScheduleOf, type WeeklySchedule } from "@/lib/offer";
import { cn } from "@/lib/utils";

export type EditableOffer = {
  roleTitle?: string;
  duration?: string;
  startDate?: string;
  weeklySchedule?: string;
  /** Band rate the offer was priced on, minor units; hours × this is the month. */
  hourlyRateMinor?: number | null;
  paidLeavesPerMonth?: number;
  message?: string;
  mode?: string;
  city?: string;
  state?: string;
  officeDays?: number;
  homeDays?: number;
  shiftFrom?: string;
  shiftTo?: string;
  laptop?: string;
};

const DURATIONS = ["1m", "2m", "3m", "6m"] as const;

/** Tomorrow in India: an offer lapses on its start date. */
function tomorrowIst(): string {
  return new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Offer editor on the proposal page. The composer's fields minus identity
 * (project and candidate never change) and minus currency (set by the
 * company's country). Draft / sent internship offers only: the server rejects
 * anything later, and full-time offers, and the form does not render there.
 * Hours and the monthly figure are worked out from the working week and
 * paid leave, as in the composer; the server does the same sum.
 */
export function ProposalOfferForm({
  proposalId,
  initial,
  currency,
  shortOnly = false,
  defaultOpen = false,
}: {
  proposalId: string;
  /** Open straight into the editor (the proposals list's Edit button). */
  defaultOpen?: boolean;
  initial: EditableOffer;
  currency: "INR" | "USD";
  /** Score below 6: at most two months. */
  shortOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [roleTitle, setRoleTitle] = useState(initial.roleTitle ?? "");
  const [duration, setDuration] = useState(initial.duration ?? "3m");
  const [startDate, setStartDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initial.startDate ?? "") ? initial.startDate! : "");
  const [schedule, setSchedule] = useState<WeeklySchedule>(weeklyScheduleOf(initial.weeklySchedule));
  // Older offers could carry any leave count; snap to the half-day choices.
  const [leaves, setLeaves] = useState(String(Math.min(3, Math.round((initial.paidLeavesPerMonth ?? 0) * 2) / 2)));
  const hours = scheduledMonthlyHours(schedule, Number(leaves) || 0);
  const monthlyMinor = initial.hourlyRateMinor ? Math.round(hours * initial.hourlyRateMinor) : null;
  const [mode, setMode] = useState(initial.mode || "remote");
  const [city, setCity] = useState(initial.city ?? "");
  const [state, setState] = useState(initial.state ?? "");
  const [officeDays, setOfficeDays] = useState(initial.officeDays ? String(initial.officeDays) : "3");
  const [homeDays, setHomeDays] = useState(initial.homeDays ? String(initial.homeDays) : "2");
  const [shiftFrom, setShiftFrom] = useState(initial.shiftFrom || "09:00");
  const [shiftTo, setShiftTo] = useState(initial.shiftTo || "18:00");
  const [laptop, setLaptop] = useState(initial.laptop || "company");
  const [message, setMessage] = useState(initial.message ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (roleTitle.trim().length < 2) return setError("Give the role a title.");
    if (!startDate || startDate < tomorrowIst()) return setError("Pick a start date after today.");
    if (mode !== "remote" && (!city.trim() || !state.trim())) return setError("An on-site or hybrid role needs a city and state.");
    if (!message.trim()) return setError("Add a job description.");

    const offer: Record<string, unknown> = {
      roleTitle: roleTitle.trim(),
      duration,
      startDate,
      weeklySchedule: schedule,
      paidLeavesPerMonth: Number(leaves) || 0,
      message: message.trim(),
      mode,
      laptop,
      shiftFrom: shiftFrom || "flexible",
      shiftTo: shiftTo || "flexible",
    };
    if (mode !== "remote") {
      offer.city = city.trim();
      offer.state = state.trim();
    }
    if (mode === "hybrid") {
      offer.officeDays = Number(officeDays) || 1;
      offer.homeDays = Number(homeDays) || 1;
    }

    setSaving(true);
    try {
      const res = await csrfFetch(`/api/proposals/${encodeURIComponent(proposalId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save - try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-ink-200/70 bg-white px-4 text-sm font-medium text-ink-700 hover:border-brand-300 hover:text-brand-800"
      >
        <Pencil className="size-4" aria-hidden />
        Edit offer
      </button>
    );
  }

  const input =
    "apple-spring h-11 w-full rounded-[10px] border border-ink-200/90 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
  const label = "mb-1 block text-xs font-semibold text-ink-700";

  return (
    <div className="space-y-3 rounded-[14px] border border-ink-200/70 bg-ink-50/60 p-4">
      <label className="block">
        <span className={label}>Role title</span>
        <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>Duration</span>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className={input}>
            {DURATIONS.filter((d) => !shortOnly || d === "1m" || d === "2m").map((d) => (
              <option key={d} value={d}>
                {d === "1m" ? "1 month" : `${d.replace("m", "")} months`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Start date</span>
          <input type="date" min={tomorrowIst()} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>Working week</span>
          <select value={schedule} onChange={(e) => setSchedule(e.target.value as WeeklySchedule)} className={input}>
            {(Object.keys(WEEKLY_SCHEDULES) as WeeklySchedule[]).map((k) => (
              <option key={k} value={k}>
                {WEEKLY_SCHEDULES[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Paid leave / month</span>
          <select value={leaves} onChange={(e) => setLeaves(e.target.value)} className={input}>
            {PAID_LEAVE_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {n === 1 ? "1 day" : `${n} days`}
              </option>
            ))}
          </select>
        </label>
        <p className="col-span-2 text-xs tabular-nums text-ink-600">
          {hours} h a month
          {monthlyMinor != null ? ` · ${formatMoney(monthlyMinor, currency)} a month` : ""}
        </p>
        <label className="block">
          <span className={label}>Work mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={input}>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </label>
        <label className="block">
          <span className={label}>Laptop</span>
          <select value={laptop} onChange={(e) => setLaptop(e.target.value)} className={input}>
            <option value="company">Company provides</option>
            <option value="intern">Intern provides</option>
          </select>
        </label>
        {mode !== "remote" ? (
          <>
            <label className="block">
              <span className={label}>City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className={label}>State</span>
              <input value={state} onChange={(e) => setState(e.target.value)} className={input} />
            </label>
          </>
        ) : null}
        {mode === "hybrid" ? (
          <>
            <label className="block">
              <span className={label}>Office days / week</span>
              <input value={officeDays} inputMode="numeric" onChange={(e) => setOfficeDays(e.target.value.replace(/\D/g, "").slice(0, 1))} className={cn(input, "tabular-nums")} />
            </label>
            <label className="block">
              <span className={label}>Home days / week</span>
              <input value={homeDays} inputMode="numeric" onChange={(e) => setHomeDays(e.target.value.replace(/\D/g, "").slice(0, 1))} className={cn(input, "tabular-nums")} />
            </label>
          </>
        ) : null}
        <label className="block">
          <span className={label}>Shift from</span>
          <input type="time" value={shiftFrom} onChange={(e) => setShiftFrom(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>Shift to</span>
          <input type="time" value={shiftTo} onChange={(e) => setShiftTo(e.target.value)} className={input} />
        </label>
      </div>
      <label className="block">
        <span className={label}>Job description</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="apple-spring min-h-24 w-full rounded-[10px] border border-ink-200/90 bg-white px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
      </label>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="apple-spring apple-pressable inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save changes
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center rounded-[10px] border border-ink-200/70 bg-white px-4 text-xs font-medium text-ink-600 hover:bg-ink-50"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-text-subtle">The candidate is told the offer changed and asked to review it again.</p>
    </div>
  );
}
