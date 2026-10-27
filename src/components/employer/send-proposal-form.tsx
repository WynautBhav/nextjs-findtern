"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleGauge, Info, Send, TriangleAlert } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { RATING_META, type CandidateSummary } from "@/lib/employer-candidates";
import { type Currency, type Pricing } from "@/lib/employer-pricing";
import { formatMoney, formatPerHire, formatRate } from "@/lib/format";
import { PAID_LEAVE_OPTIONS, scheduledMonthlyHours, WEEKLY_SCHEDULES, workingDaysPerWeek, type WeeklySchedule } from "@/lib/offer";
import { shiftInIst, TIMEZONES } from "@/lib/timezones";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { offerableModes, type WorkPreference } from "@/lib/work-preference";
import { CountdownAgreement, EMPLOYER_HIRING_POLICY } from "@/components/app/countdown-agreement";

/**
 * Proposal composer.
 *
 * Fields map 1:1 onto the keys the legacy handler persisted in
 * `proposals.offer_details` (routes.ts / employer-send-proposal.tsx:1272), so the
 * shape is already known to the rest of the app - the intern's proposal page
 * reads the same keys back out.
 *
 * The one thing not typed by hand is compensation: the hourly rate and per-hire
 * charge come from the candidate's band, resolved server-side against the CMS
 * rate card, and the hours come from the working week less paid leave (legacy
 * employer-send-proposal.tsx:533-716). Monthly = rate × hours; nothing here
 * can undercut it.
 *
 * The server recomputes the rate and totals from the candidate's band; the
 * figures here are a preview. The currency is not a choice: it follows the
 * company's country. Sending opens the hiring-policy agreement (legacy
 * PolicyConfirmationDialog) every time.
 */

type ProjectOption = {
  id: string;
  projectName: string;
  skills: string[];
  locationType: string | null;
  timezone: string | null;
};

const DURATIONS = [
  { value: "1m", label: "1 month" },
  { value: "2m", label: "2 months" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
] as const;

const MODES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

/** Column heads for the four-axis meter in the summary card. */
const SHORT_RATING: Record<string, string> = { communication: "Comms", coding: "Coding", aptitude: "Aptitude", interview: "Interview" };

/** Legacy values (EMH-04): "company" or "candidate". */
const LAPTOP_OPTIONS = [
  { value: "company", label: "Company provides" },
  { value: "candidate", label: "Candidate's own laptop" },
] as const;

/** Quick fills for the working hours; the times stay editable (bug sheet 23 Oct). */
const SHIFT_PRESETS = [
  { label: "9am–6pm", from: "09:00", to: "18:00" },
  { label: "9am–1pm", from: "09:00", to: "13:00" },
  { label: "5pm–9pm", from: "17:00", to: "21:00" },
] as const;

export function SendProposalForm({
  candidate,
  projects,
  pricing,
  defaultCurrency,
  rateCardSource,
  employerId,
  internId,
  initialProjectId,
  preference,
  companyTimezone = "Asia/Kolkata",
  candidateHasLaptop = null,
}: {
  candidate: CandidateSummary;
  /** Where the candidate said they can work; the offer's location follows it. */
  preference: WorkPreference;
  projects: ProjectOption[];
  pricing: Record<Currency, Pricing>;
  /** The company's billing currency, fixed by its country (India → INR). */
  defaultCurrency: Currency;
  rateCardSource: "plan" | "default";
  employerId: string;
  internId: string;
  /** The project the employer came from (shortlist, cart, candidates filter). */
  initialProjectId?: string;
  /** Where the company is (its country): the timezone when a project sets none. */
  companyTimezone?: string;
  /** False: the candidate has no laptop, so only "Company provides" is offered (EMH-18). */
  candidateHasLaptop?: boolean | null;
}) {
  const router = useRouter();
  // The project the employer came from, not just the first one in the list:
  // the cart and profile links pass `?project=`, and ignoring it filed the
  // proposal under another project.
  const firstProject = projects.find((p) => p.id === initialProjectId) ?? projects[0];

  // Row 64: no currency choice. Indian companies see INR, everyone else USD.
  const currency = defaultCurrency;
  const [projectId, setProjectId] = useState(firstProject?.id ?? "");
  // The selected project owns the timezone (legacy sent it); without one, the
  // company's own, from its location (bug sheet 26 Oct).
  const projectTimezone = (id: string) => projects.find((p) => p.id === id)?.timezone || companyTimezone;
  const [timezone, setTimezone] = useState(projectTimezone(firstProject?.id ?? ""));
  const modes = MODES.filter((m) => offerableModes(preference).includes(m.value));
  const allowedMode = (m: string | null | undefined) => (m && modes.some((x) => x.value === m) ? m : null);
  const [roleTitle, setRoleTitle] = useState(firstProject?.projectName ?? "");
  // Below a score of 6 the legacy rule caps offers at two months.
  const shortOnly = candidate.scored && candidate.score > 0 && candidate.score < 6;
  const [duration, setDuration] = useState(shortOnly ? "2m" : "3m");
  const [startDate, setStartDate] = useState("");
  const [schedule, setSchedule] = useState<WeeklySchedule>("mon_fri");
  const [mode, setMode] = useState(allowedMode(firstProject?.locationType) ?? modes[0]?.value ?? "remote");
  // With preferred cities on file the city is picked from them; the first one
  // is filled in so an on-site or hybrid offer starts complete.
  const [city, setCity] = useState(preference.cities[0]?.city ?? "");
  const [state, setState] = useState(preference.cities[0]?.state ?? "");
  // Office + home = the working days in the week (legacy, EMH-27): the
  // employer picks office days, home is the rest.
  const [officeDays, setOfficeDays] = useState("3");
  const week = workingDaysPerWeek(schedule);
  const homeDays = String(Math.max(0, week - (Number(officeDays) || 0)));
  const [shiftFrom, setShiftFrom] = useState("09:00");
  const [shiftTo, setShiftTo] = useState("18:00");
  const [flexibleHours, setFlexibleHours] = useState(false);
  const laptopOptions = LAPTOP_OPTIONS.filter((l) => l.value !== "candidate" || candidateHasLaptop !== false);
  const [laptop, setLaptop] = useState<string>("company");
  const [paidLeaves, setPaidLeaves] = useState("2");
  const [message, setMessage] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const rate = pricing[currency];
  // The intern reads the hours in India time (legacy composer; EMH-31).
  const istHours = flexibleHours ? null : shiftInIst(shiftFrom, shiftTo, timezone, startDate || null);
  // An offer lapses on its start date, so the earliest start is tomorrow (IST).
  const minStart = useMemo(() => tomorrowIst(), []);

  // The same sum the server does: (working days − paid leave) × 8 h × rate.
  const monthlyHours = scheduledMonthlyHours(schedule, Number(paidLeaves) || 0);
  const totals = useMemo(() => {
    const monthly = monthlyHours * (rate.hourlyRateMinor / 100);
    // The one-time hiring fee, charged once with the first payment.
    const perHire = rate.perHireMinor / 100;
    return { monthly, perHire };
  }, [monthlyHours, rate]);

  /** Validate first; the policy agreement only opens for a complete offer. */
  function review() {
    const problems = validate({ projectId, roleTitle, duration, startDate, minStart, mode, city, state, officeDays, homeDays, week, laptop, message, shiftFrom, shiftTo, flexibleHours, timezone });
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setNotice({ tone: "bad", text: "Some details need attention before this can be sent." });
      document.getElementById(Object.keys(problems)[0])?.focus();
      return;
    }
    setNotice(null);
    setPolicyOpen(true);
  }

  async function send() {
    let leaving = false;
    setSending(true);
    setNotice(null);
    try {
      const res = await csrfFetch(`/api/employer/${employerId}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internId,
          projectId,
          flowType: "direct",
          agreedToPolicy: true,
          roleTitle: roleTitle.trim(),
          jd: [message.trim(), restrictions.trim()].filter(Boolean).join("\n\n"),
          mode,
          location: [city.trim(), state.trim()].filter(Boolean).join(", "),
          ...(mode !== "remote" ? { city: city.trim(), state: state.trim() } : {}),
          ...(mode === "hybrid" ? { officeDays: Number(officeDays), homeDays: Number(homeDays) } : {}),
          timezone,
          startDate,
          duration,
          weeklySchedule: schedule,
          shiftFrom: flexibleHours ? "flexible" : shiftFrom,
          shiftTo: flexibleHours ? "flexible" : shiftTo,
          laptop,
          paidLeavesPerMonth: Number(paidLeaves) || 0,
          skills: projects.find((p) => p.id === projectId)?.skills ?? [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      setPolicyOpen(false);
      if (res.ok) {
        setNotice({ tone: "ok", text: "Proposal sent. Taking you to your proposals…" });
        // replace: Back must not land on a composer for an offer already sent.
        router.replace("/employer/proposals");
        router.refresh();
        leaving = true;
        return;
      }
      // Already sent (a retry, or a second tab): open the live offer instead.
      if (res.status === 409 && typeof data.proposalId === "string") {
        setNotice({ tone: "ok", text: "This candidate already has your offer. Opening it…" });
        router.replace(`/employer/proposal/${encodeURIComponent(data.proposalId)}`);
        leaving = true;
        return;
      }
      setNotice({ tone: "bad", text: data.error ?? "The proposal was not sent. Nothing has changed - try again." });
    } catch {
      setPolicyOpen(false);
      setNotice({ tone: "bad", text: "You appear to be offline. Nothing was sent." });
    } finally {
      // Stay locked while the next page loads, so a second click cannot send.
      if (!leaving) setSending(false);
    }
  }

  const durationLabel = DURATIONS.find((d) => d.value === duration)?.label ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
        className="min-w-0 overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white shadow-xs"
      >
        {/* ── 1. The role ─────────────────────────────────────────────── */}
        <Step n={1} title="The role" hint="What the candidate is being offered, and from when.">
          {projects.length === 0 ? (
            <p className="rounded-apple-md border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm text-ink-700">
              You have no open project. A proposal has to attach to one, so{" "}
              <Link href="/employer/projects" className="font-medium text-brand-700 underline underline-offset-4">
                open or create one first
              </Link>
              .
            </p>
          ) : (
            <SelectField
              id="projectId"
              label="Project"
              value={projectId}
              options={projects.map((p) => ({ value: p.id, label: p.projectName }))}
              error={errors.projectId}
              onChange={(v) => {
                setProjectId(v);
                const project = projects.find((p) => p.id === v);
                if (project) {
                  // Keep the role title in step with the project unless the
                  // employer has already typed their own.
                  if (!roleTitle.trim() || projects.some((p) => p.projectName === roleTitle)) {
                    setRoleTitle(project.projectName);
                  }
                  const projectMode = allowedMode(project.locationType);
                  if (projectMode) setMode(projectMode);
                  setTimezone(projectTimezone(project.id));
                }
              }}
            />
          )}

          <Field
            id="roleTitle"
            label="Role title"
            value={roleTitle}
            error={errors.roleTitle}
            placeholder="Backend engineering intern"
            hint="What the candidate sees at the top of the offer."
            onChange={setRoleTitle}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <span className="block text-sm font-medium text-ink-800">Duration</span>
              <div role="radiogroup" aria-label="Duration" className="mt-2 grid grid-cols-4 gap-1.5">
                {DURATIONS.map((d) => {
                  const disabled = shortOnly && (d.value === "3m" || d.value === "6m");
                  return (
                    <button
                      key={d.value}
                      type="button"
                      role="radio"
                      aria-checked={duration === d.value}
                      disabled={disabled}
                      onClick={() => setDuration(d.value)}
                      className={cn(
                        "apple-spring apple-pressable nums min-h-11 rounded-apple-sm border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40",
                        duration === d.value
                          ? "border-brand-700 bg-brand-700 text-white"
                          : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50",
                      )}
                    >
                      {d.value.replace("m", "")} mo
                    </button>
                  );
                })}
              </div>
              {shortOnly ? (
                <p className="mt-1.5 text-xs text-ink-500">Candidates scoring below 6 can be offered up to 2 months.</p>
              ) : null}
            </div>
            <Field
              id="startDate"
              label="Start date"
              type="date"
              min={minStart}
              value={startDate}
              error={errors.startDate}
              hint="The offer closes on this date if unanswered."
              onChange={setStartDate}
            />
          </div>
        </Step>

        {/* ── 2. Pay ──────────────────────────────────────────────────── */}
        <Step n={2} title="Pay" hint={`The hourly rate is fixed by the candidate's score band. Billed in ${currency}, set by your company's country.`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-apple-lg bg-brand-50 px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">{rate.bandName} band</p>
            <p className="nums text-sm text-ink-700">
              <span className="font-semibold text-ink-900">{formatRate(rate.hourlyRateMinor, currency)}</span>
              {" · "}
              <span>{formatPerHire(rate.perHireMinor, currency)}</span> one-time hiring fee
            </p>
            <p className="flex w-full items-start gap-1.5 text-sm text-ink-600">
              <Info className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
              {rateCardSource === "plan" ? "Rates come from your plan." : "Standard published rates apply."}{" "}
              {rate.bandBlurb}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="weeklySchedule"
              label="Working week"
              value={schedule}
              options={(Object.keys(WEEKLY_SCHEDULES) as WeeklySchedule[]).map((k) => ({
                value: k,
                // The day count is in the hours hint below; here it was cut off.
                label: WEEKLY_SCHEDULES[k].label,
              }))}
              onChange={(v) => setSchedule(v as WeeklySchedule)}
            />
            <SelectField
              id="paidLeaves"
              label="Paid leave / month"
              value={paidLeaves}
              options={PAID_LEAVE_OPTIONS.map((n) => ({ value: String(n), label: n === 1 ? "1 day" : `${n} days` }))}
              onChange={setPaidLeaves}
            />
            <ReadOnlyField
              id="monthlyHours"
              label="Hours per month"
              value={`${monthlyHours} h`}
              hint={`(${WEEKLY_SCHEDULES[schedule].days} working days − ${Number(paidLeaves) || 0} leave) × 8 h`}
            />
            <ReadOnlyField
              id="monthlyAmount"
              label={`Monthly amount (${currency})${currency === "INR" && totals.monthly > 0 ? " (includes GST)" : ""}`}
              value={formatMoney(Math.round(totals.monthly * 100), currency)}
              hint={`${formatRate(rate.hourlyRateMinor, currency)} × ${monthlyHours} h. Worked out for you.`}
            />
          </div>
        </Step>

        {/* ── 3. Work setup ───────────────────────────────────────────── */}
        <Step n={3} title="Work setup" hint="Based on where the candidate said they can work. Shown before they accept.">
          <fieldset>
            <legend className="text-sm font-medium text-ink-800">Work mode</legend>
            <p className="mt-0.5 text-sm text-ink-600">
              {modes.length < MODES.length
                ? `This candidate is open to ${modes.map((m) => m.label.toLowerCase()).join(" or ")} work.`
                : "This candidate is open to remote, hybrid or on-site work."}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:max-w-sm">
              {modes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={mode === option.value}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    "apple-spring apple-pressable min-h-11 rounded-apple-sm border text-sm font-medium",
                    mode === option.value
                      ? "border-brand-700 bg-brand-700 text-white"
                      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          {mode !== "remote" ? (
            preference.cities.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField
                  id="city"
                  label="Work city"
                  hint="From the candidate's preferred cities."
                  value={preference.cities.find((c) => c.city === city && c.state === state)?.label ?? ""}
                  options={[
                    ...(preference.cities.some((c) => c.city === city && c.state === state) ? [] : [{ value: "", label: "Choose a city…" }]),
                    ...preference.cities.map((c) => ({ value: c.label, label: c.label })),
                  ]}
                  error={errors.city ?? errors.state}
                  onChange={(v) => {
                    const pick = preference.cities.find((c) => c.label === v);
                    setCity(pick?.city ?? "");
                    setState(pick?.state ?? "");
                  }}
                />
                {state || !city ? null : (
                  <Field id="state" label="State" value={state} error={errors.state} onChange={setState} />
                )}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="city" label="City" value={city} error={errors.city} hint="The candidate listed no preferred city." onChange={setCity} />
                <Field id="state" label="State" value={state} error={errors.state} onChange={setState} />
              </div>
            )
          ) : null}

          {mode === "hybrid" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                id="officeDays"
                label="Office days per week"
                hint={`Office and home days add up to the ${week} working days.`}
                value={officeDays}
                options={Array.from({ length: week - 1 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} day${i ? "s" : ""}` }))}
                error={errors.officeDays}
                onChange={setOfficeDays}
              />
              <ReadOnlyField id="homeDays" label="Work-from-home days per week" value={`${homeDays} day${homeDays === "1" ? "" : "s"}`} hint="The rest of the working week." />
            </div>
          ) : null}

          <fieldset>
            <legend className="text-sm font-medium text-ink-800">Working hours</legend>
            {!flexibleHours ? (
              <>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-sm">
                  <Field id="shiftFrom" label="From" type="time" value={shiftFrom} error={errors.shiftFrom} onChange={setShiftFrom} />
                  <Field id="shiftTo" label="To" type="time" value={shiftTo} error={errors.shiftTo} onChange={setShiftTo} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SHIFT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setShiftFrom(p.from);
                        setShiftTo(p.to);
                      }}
                      className={cn(
                        "apple-spring nums min-h-11 rounded-apple-sm border px-3 text-sm font-medium",
                        shiftFrom === p.from && shiftTo === p.to
                          ? "border-brand-600 bg-brand-50 text-brand-800"
                          : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={flexibleHours}
                onChange={(e) => setFlexibleHours(e.target.checked)}
                className="size-4 rounded-sm border-ink-300 accent-brand-700"
              />
              Flexible hours, set by the intern
            </label>
            {istHours ? (
              <p className="nums mt-1 text-sm text-ink-600">
                The intern sees these as <span className="font-medium text-ink-800">{istHours}</span>.
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="timezone"
              label="Timezone"
              hint="The working hours and interview slots use this zone."
              value={timezone}
              options={TIMEZONES.map((t) => ({ value: t.id, label: t.group ? `── ${t.label} ──` : t.label, disabled: t.group }))}
              onChange={setTimezone}
            />
            <SelectField
              id="laptop"
              label="Laptop"
              value={laptop}
              options={laptopOptions.map((l) => ({ value: l.value, label: l.label }))}
              hint={candidateHasLaptop === false ? "The candidate has no laptop, so the company provides one." : undefined}
              error={errors.laptop}
              onChange={setLaptop}
            />
          </div>
        </Step>

        {/* ── 4. Message ──────────────────────────────────────────────── */}
        <Step n={4} title="Message" hint="Plain text. This is the part candidates read to decide." last>
          <TextArea
            id="message"
            label="What the intern will do"
            rows={6}
            placeholder="What the intern will own, who they will work with, and what success looks like at the end of it."
            value={message}
            error={errors.message}
            onChange={setMessage}
          />
          <TextArea
            id="restrictions"
            label="Anything else (optional)"
            rows={3}
            placeholder="No client data on personal devices. Two fixed Saturdays a month for college."
            value={restrictions}
            onChange={setRestrictions}
          />
        </Step>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-ink-50/60 px-6 py-4 lg:hidden">
          <button type="submit" disabled={sending || projects.length === 0} className={buttonClass({ block: true })}>
            <Send className="size-4" aria-hidden />
            Review and send
          </button>
        </div>
      </form>

      {/* ── Summary ─────────────────────────────────────────────────── */}
      <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <section className="overflow-hidden rounded-apple-xl border border-ink-200/80 bg-white shadow-xs">
          <div className="flex items-center gap-3 border-b border-ink-100 p-5">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-800">
              {candidate.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-900">{candidate.name}</p>
              <p className="nums flex items-center gap-1.5 text-sm text-ink-600">
                <CircleGauge className="size-4" aria-hidden />
                {candidate.scored ? `${candidate.score.toFixed(1)}/10 Findtern Score` : "Not scored"}
              </p>
            </div>
            <Link
              href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
              className="apple-spring inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Profile
            </Link>
          </div>
          {RATING_META.some((r) => candidate.ratings[r.key] > 0) ? (
            <dl className="grid grid-cols-4 border-b border-ink-100">
              {RATING_META.map((r, i) => (
                <div key={r.key} className={cn("px-3 py-3 text-center", i > 0 && "border-l border-ink-100")}>
                  <dt className="truncate text-xs text-ink-500">{SHORT_RATING[r.key] ?? r.label}</dt>
                  <dd className="nums mt-0.5 text-sm font-semibold text-ink-900">{candidate.ratings[r.key] > 0 ? candidate.ratings[r.key].toFixed(1) : "-"}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="p-5">
            <h2 className="text-base font-semibold text-ink-900">Offer amount</h2>
            {/* One month's figure only (client QA), not monthly × months. */}
            <dl className="mt-4 space-y-2.5">
              <Row label={currency === "INR" && totals.monthly > 0 ? "Monthly (incl. GST)" : "Monthly amount"} strong>
                {formatMoney(Math.round(totals.monthly * 100), currency)}
              </Row>
              <Row label="Duration">{durationLabel || "-"}</Row>
              {totals.perHire > 0 ? (
                <Row label="Hiring fee (one-time)">{formatMoney(Math.round(totals.perHire * 100), currency)}</Row>
              ) : null}
            </dl>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Nothing is charged now. You pay once the candidate accepts.
            </p>

            {notice ? (
              <p
                role="status"
                className={cn(
                  "mt-4 flex items-start gap-2 rounded-apple-md px-3 py-2.5 text-sm",
                  notice.tone === "ok" ? "bg-success-soft text-ink-800" : "border border-warning/25 bg-warning-soft text-ink-700",
                )}
              >
                {notice.tone === "bad" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> : null}
                <span>{notice.text}</span>
              </p>
            ) : null}

            <button
              type="button"
              onClick={review}
              disabled={sending || projects.length === 0}
              className={buttonClass({ block: true, className: "mt-4 hidden lg:inline-flex" })}
            >
              <Send className="size-4" aria-hidden />
              Review and send
            </button>
          </div>
        </section>
      </aside>

      <CountdownAgreement
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        title="Findtern hiring policies"
        description="Read and accept these before the proposal goes to the candidate."
        sections={EMPLOYER_HIRING_POLICY}
        agreeLabel="I have read and agree to the above policies."
        confirmLabel="Agree and send"
        busy={sending}
        onConfirm={send}
      />
    </div>
  );
}

function Step({
  n,
  title,
  hint,
  last,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("grid gap-5 p-6 sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-x-4", !last && "border-b border-ink-100")}>
      <span aria-hidden className="nums hidden size-8 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800 sm:grid">
        {n}
      </span>
      <div className="min-w-0 space-y-5">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-sm text-ink-600">{hint}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Tomorrow in India, as YYYY-MM-DD. */
function tomorrowIst(): string {
  return new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className={strong ? "nums text-lg font-semibold tracking-tight text-ink-900" : "nums text-sm font-medium text-ink-800"}>
        {children}
      </dd>
    </div>
  );
}

/* ── Form primitives ────────────────────────────────────────────────────── */

const FIELD_BASE =
  "apple-spring mt-2 min-h-11 w-full rounded-apple-sm border bg-white px-3.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus-visible:ring-2";
const FIELD_OK = "border-ink-200 focus-visible:border-brand-500 focus-visible:ring-brand-500/20";
const FIELD_BAD = "border-danger focus-visible:border-danger focus-visible:ring-danger/20";

function Field({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  placeholder,
  inputMode,
  min,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "url";
  min?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${FIELD_BASE} ${error ? FIELD_BAD : FIELD_OK}`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A value owned by the project, shown but not editable from here. */
function ReadOnlyField({
  id,
  label,
  value,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      <input
        id={id}
        name={id}
        value={value}
        readOnly
        className={`${FIELD_BASE} ${FIELD_OK} cursor-not-allowed bg-ink-50 text-ink-600`}
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${FIELD_BASE} ${error ? FIELD_BAD : FIELD_OK}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextArea({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  rows = 4,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 min-h-11 w-full rounded-apple-sm border bg-white px-3.5 py-2.5 text-sm leading-relaxed text-ink-900 outline-none apple-spring placeholder:text-ink-400 focus-visible:ring-2 ${
          error ? FIELD_BAD : FIELD_OK
        }`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ── Validation ──────────────────────────────────────────────────────────── */

type Draft = {
  projectId: string;
  roleTitle: string;
  duration: string;
  startDate: string;
  minStart: string;
  mode: string;
  city: string;
  state: string;
  officeDays: string;
  homeDays: string;
  /** Working days in the week: office + home must equal it (EMH-27). */
  week: number;
  laptop: string;
  message: string;
  shiftFrom: string;
  shiftTo: string;
  flexibleHours: boolean;
  timezone: string;
};

function validate(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!draft.projectId) errors.projectId = "A proposal must attach to one of your projects.";
  if (draft.roleTitle.trim().length < 2) errors.roleTitle = "Give the role a title.";
  if (!DURATIONS.some((d) => d.value === draft.duration)) errors.duration = "Pick a duration.";
  if (!draft.startDate) {
    errors.startDate = "A start date is required.";
  } else if (Number.isNaN(Date.parse(draft.startDate))) {
    errors.startDate = "That is not a date.";
  } else if (draft.startDate < draft.minStart) {
    errors.startDate = "Pick a date after today.";
  }

  if (draft.mode !== "remote" && !draft.city.trim()) {
    errors.city = "An on-site or hybrid role needs a city.";
  }
  if (draft.mode !== "remote" && !draft.state.trim()) {
    errors.state = "An on-site or hybrid role needs a state.";
  }
  if (draft.mode === "hybrid") {
    const office = Number(draft.officeDays);
    const home = Number(draft.homeDays);
    if (!(office >= 1) || !(home >= 1) || office + home !== draft.week) {
      errors.officeDays = `Split the ${draft.week} working days between office and home, at least one each.`;
    }
  }

  if (!draft.flexibleHours) {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(draft.shiftFrom)) errors.shiftFrom = "Pick a start time.";
    if (!time.test(draft.shiftTo)) errors.shiftTo = "Pick an end time.";
    else if (draft.shiftFrom === draft.shiftTo) errors.shiftTo = "The end time must differ from the start.";
  }
  if (!draft.timezone || draft.timezone.startsWith("group-")) errors.timezone = "Pick a timezone.";
  if (!draft.laptop) errors.laptop = "Say who provides the laptop.";
  if (draft.message.trim().length < 30) {
    errors.message = "At least a couple of sentences - 30 characters minimum.";
  }

  return errors;
}
