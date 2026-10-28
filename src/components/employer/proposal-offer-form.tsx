"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import {
  billableWorkingDays,
  normalizeLaptop,
  PAID_LEAVE_OPTIONS,
  scheduledMonthlyHours,
  WEEKLY_SCHEDULES,
  weeklyScheduleOf,
  workingDaysPerWeek,
  type WeeklySchedule,
} from "@/lib/offer";
import { shiftInIst, TIMEZONES } from "@/lib/timezones";
import { offerableModes, type WorkPreference } from "@/lib/work-preference";
import { DmyDateInput } from "@/components/app/dmy-date-input";

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
  timezone?: string;
  laptop?: string;
};

const MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const DURATIONS = ["1m", "2m", "3m", "6m"] as const;

/** Tomorrow in India: an offer lapses on its start date. */
function tomorrowIst(): string {
  return new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);
}

const INPUT =
  "apple-spring min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-800";

/**
 * Offer editor on the proposal page: the composer's fields minus identity
 * (project and candidate never change) and currency (the company's country
 * sets it). Internship offers before payment only; saving an accepted one
 * sends it back to the candidate to accept again. Hours and the monthly
 * figure follow the working week and paid leave; the server does the same
 * sum and re-checks every rule here.
 */
export function ProposalOfferForm({
  proposalId,
  initial,
  currency,
  shortOnly = false,
  defaultOpen = false,
  accepted = false,
  hasLaptop = null,
  preference = { modes: [], cities: [] },
}: {
  proposalId: string;
  /** The candidate already accepted: saving asks them to accept again. */
  accepted?: boolean;
  /** The candidate said they have no laptop: the company must provide one (EMH-18). */
  hasLaptop?: boolean | null;
  /** Where the candidate can work; mode and city follow it. */
  preference?: WorkPreference;
  /** Open straight into the editor (the list's Edit button). */
  defaultOpen?: boolean;
  initial: EditableOffer;
  currency: "INR" | "USD";
  /** Score below 6: at most two months. */
  shortOnly?: boolean;
}) {
  const router = useRouter();
  const flexibleAtStart = !initial.shiftFrom || initial.shiftFrom === "flexible";
  const [open, setOpen] = useState(defaultOpen);
  const [roleTitle, setRoleTitle] = useState(initial.roleTitle ?? "");
  const [duration, setDuration] = useState(initial.duration ?? "3m");
  const [startDate, setStartDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initial.startDate ?? "") ? initial.startDate! : "");
  const [schedule, setSchedule] = useState<WeeklySchedule>(weeklyScheduleOf(initial.weeklySchedule));
  // Older offers could carry any leave count; snap to the half-day choices.
  const [leaves, setLeaves] = useState(String(Math.min(3, Math.round((initial.paidLeavesPerMonth ?? 0) * 2) / 2)));
  const hours = scheduledMonthlyHours(schedule, Number(leaves) || 0);
  const days = billableWorkingDays(schedule);
  const monthlyMinor = initial.hourlyRateMinor ? Math.round(hours * initial.hourlyRateMinor) : null;
  const modes = MODE_OPTIONS.filter((m) => offerableModes(preference).includes(m.value) || m.value === initial.mode);
  const [mode, setMode] = useState(initial.mode || modes[0]?.value || "remote");
  const [timezone, setTimezone] = useState(initial.timezone || "Asia/Kolkata");
  const [city, setCity] = useState(initial.city ?? "");
  const [state, setState] = useState(initial.state ?? "");
  const week = workingDaysPerWeek(schedule);
  const [officeDays, setOfficeDays] = useState(String(Math.min(week - 1, Math.max(1, initial.officeDays ?? 3))));
  const homeDays = Math.max(0, week - (Number(officeDays) || 0));
  const [flexible, setFlexible] = useState(flexibleAtStart);
  const [shiftFrom, setShiftFrom] = useState(flexibleAtStart ? "09:00" : initial.shiftFrom!);
  const [shiftTo, setShiftTo] = useState(flexibleAtStart ? "18:00" : initial.shiftTo || "18:00");
  const noLaptop = hasLaptop === false;
  const [laptop, setLaptop] = useState(noLaptop ? "company" : normalizeLaptop(initial.laptop) || "company");
  const [message, setMessage] = useState(initial.message ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ist = flexible ? null : shiftInIst(shiftFrom, shiftTo, timezone, startDate);

  async function save() {
    setError("");
    if (roleTitle.trim().length < 2) return setError("Give the role a title.");
    if (!startDate || startDate < tomorrowIst()) return setError("Pick a start date after today.");
    if (mode !== "remote" && (!city.trim() || !state.trim())) return setError("An on-site or hybrid role needs a city and state.");
    if (mode === "hybrid" && !(Number(officeDays) >= 1 && homeDays >= 1)) return setError(`Split the ${week} working days between office and home.`);
    if (!flexible && (!shiftFrom || !shiftTo || shiftFrom === shiftTo)) return setError("Pick a start and end time, or choose flexible hours.");
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
      shiftFrom: flexible ? "flexible" : shiftFrom,
      shiftTo: flexible ? "flexible" : shiftTo,
      timezone,
    };
    if (mode !== "remote") {
      offer.city = city.trim();
      offer.state = state.trim();
    }
    if (mode === "hybrid") {
      offer.officeDays = Number(officeDays);
      offer.homeDays = homeDays;
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
        setError(json?.error ?? "Couldn't save. Nothing changed - try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("You appear to be offline. Nothing was saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "outline", block: true })}>
        <Pencil className="size-4" aria-hidden />
        Edit offer
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-apple-lg border border-ink-200/80 bg-ink-50/70 p-4">
      <p className="text-sm leading-relaxed text-ink-600">
        {accepted
          ? "The candidate accepted the current terms. Saving sends the changed offer back to them to accept again before you can pay."
          : "The candidate is told the offer changed and asked to review it again."}
      </p>
      <label className="block">
        <span className={LABEL}>Role title</span>
        <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} className={INPUT} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={LABEL}>Duration</span>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className={INPUT}>
            {DURATIONS.filter((d) => !shortOnly || d === "1m" || d === "2m").map((d) => (
              <option key={d} value={d}>
                {d === "1m" ? "1 month" : `${d.replace("m", "")} months`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Start date</span>
          <DmyDateInput min={tomorrowIst()} value={startDate} onChange={setStartDate} className={INPUT} />
        </label>
        <label className="col-span-2 block">
          <span className={LABEL}>Working week</span>
          <select
            value={schedule}
            onChange={(e) => {
              const next = e.target.value as WeeklySchedule;
              setSchedule(next);
              setOfficeDays((v) => String(Math.min(workingDaysPerWeek(next) - 1, Math.max(1, Number(v) || 1))));
            }}
            className={INPUT}
          >
            {(Object.keys(WEEKLY_SCHEDULES) as WeeklySchedule[]).map((k) => (
              <option key={k} value={k}>
                {WEEKLY_SCHEDULES[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block">
          <span className={LABEL}>Paid leave a month</span>
          <select value={leaves} onChange={(e) => setLeaves(e.target.value)} className={INPUT}>
            {PAID_LEAVE_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {n === 1 ? "1 day" : `${n} days`}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 space-y-0.5">
          <p className="nums text-sm font-medium text-ink-800">
            {hours} h a month
            {monthlyMinor != null ? ` · ${formatMoney(monthlyMinor, currency)} a month` : ""}
            {monthlyMinor != null && currency === "INR" ? <span className="text-text-subtle"> (includes GST)</span> : null}
          </p>
          <p className="text-xs text-text-subtle">
            ({days} working days − {Number(leaves) || 0} leave) × 8 h
          </p>
        </div>
        <label className="block">
          <span className={LABEL}>Work mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={INPUT}>
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Laptop</span>
          <select value={laptop} onChange={(e) => setLaptop(e.target.value)} className={INPUT}>
            <option value="company">Company provides</option>
            {noLaptop ? null : <option value="candidate">Candidate&apos;s own</option>}
          </select>
        </label>
        {noLaptop ? <p className="col-span-2 -mt-1 text-xs text-text-subtle">The candidate has no laptop, so the company provides one.</p> : null}
        {mode !== "remote" && preference.cities.length > 0 ? (
          <label className="col-span-2 block">
            <span className={LABEL}>Work city (candidate&apos;s preference)</span>
            <select
              value={preference.cities.find((c) => c.city === city && c.state === state)?.label ?? ""}
              onChange={(e) => {
                const pick = preference.cities.find((c) => c.label === e.target.value);
                setCity(pick?.city ?? "");
                setState(pick?.state ?? "");
              }}
              className={INPUT}
            >
              {preference.cities.some((c) => c.city === city && c.state === state) ? null : (
                <option value="">{city ? `${city}${state ? `, ${state}` : ""} (current)` : "Choose a city…"}</option>
              )}
              {preference.cities.map((c) => (
                <option key={c.label} value={c.label}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : mode !== "remote" ? (
          <>
            <label className="block">
              <span className={LABEL}>City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className={LABEL}>State</span>
              <input value={state} onChange={(e) => setState(e.target.value)} className={INPUT} />
            </label>
          </>
        ) : null}
        {mode === "hybrid" ? (
          <>
            <label className="block">
              <span className={LABEL}>Office days</span>
              <select value={officeDays} onChange={(e) => setOfficeDays(e.target.value)} className={INPUT}>
                {Array.from({ length: week - 1 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {n} a week
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className={LABEL}>Home days</span>
              <p className="nums flex min-h-11 items-center rounded-apple-sm border border-ink-200 bg-ink-100/60 px-3 text-sm text-ink-700">{homeDays} a week</p>
            </div>
          </>
        ) : null}
        <label className="col-span-2 inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-800">
          <input type="checkbox" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} className="size-4 rounded-sm accent-brand-700" />
          Flexible hours, set by the intern
        </label>
        {!flexible ? (
          <>
            <label className="block">
              <span className={LABEL}>From</span>
              <input type="time" value={shiftFrom} onChange={(e) => setShiftFrom(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className={LABEL}>To</span>
              <input type="time" value={shiftTo} onChange={(e) => setShiftTo(e.target.value)} className={INPUT} />
            </label>
          </>
        ) : null}
        <label className="col-span-2 block">
          <span className={LABEL}>Timezone</span>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={INPUT}>
            {TIMEZONES.map((t) =>
              t.group ? (
                <option key={t.id} value={t.id} disabled>
                  ── {t.label} ──
                </option>
              ) : (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ),
            )}
          </select>
          {ist ? <span className="nums mt-1.5 block text-xs text-text-subtle">For the intern: {ist}</span> : null}
        </label>
      </div>
      <label className="block">
        <span className={LABEL}>Job description</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="apple-spring w-full rounded-apple-sm border border-ink-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-ink-900 outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className={buttonClass({ size: "sm", className: "flex-1" })}>
          {saving ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Save changes
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={saving} className={buttonClass({ variant: "ghost", size: "sm" })}>
          Cancel
        </button>
      </div>
    </div>
  );
}
