"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleGauge, Info, Send, Sparkles, TriangleAlert } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { RATING_META, type CandidateSummary } from "@/lib/employer-candidates";
import { durationMonths, type Currency, type Pricing } from "@/lib/employer-pricing";
import { formatMoney, formatPerHire, formatRate } from "@/lib/format";

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
 * rate card. An employer can override the monthly figure, which is what the
 * legacy form allowed; they cannot decouple the rate from the score band
 * without editing `offer_details` directly.
 *
 * The server recomputes the rate and totals from the candidate's band; the
 * figures here are a preview.
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

const LAPTOP_OPTIONS = [
  { value: "company", label: "Company provides" },
  { value: "intern", label: "Intern provides" },
] as const;

const SHIFT_HOURS: Record<string, [string, string]> = {
  "full-day": ["09:00", "18:00"],
  morning: ["09:00", "13:00"],
  evening: ["17:00", "21:00"],
  flexible: ["", ""],
};

const SHIFT_PRESETS = [
  { value: "full-day", label: "Full day, 9am–6pm" },
  { value: "morning", label: "Morning, 9am–1pm" },
  { value: "evening", label: "Evening, 5pm–9pm" },
  { value: "flexible", label: "Flexible, set by the intern" },
] as const;

export function SendProposalForm({
  candidate,
  projects,
  pricing,
  defaultCurrency,
  rateCardSource,
  employerId,
  internId,
}: {
  candidate: CandidateSummary;
  projects: ProjectOption[];
  pricing: Record<Currency, Pricing>;
  defaultCurrency: Currency;
  rateCardSource: "plan" | "default";
  employerId: string;
  internId: string;
}) {
  const router = useRouter();
  const firstProject = projects[0];

  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [projectId, setProjectId] = useState(firstProject?.id ?? "");
  const [roleTitle, setRoleTitle] = useState(firstProject?.projectName ?? "");
  // Below a score of 6 the legacy rule caps offers at two months.
  const shortOnly = candidate.scored && candidate.score > 0 && candidate.score < 6;
  const [duration, setDuration] = useState(shortOnly ? "2m" : "3m");
  const [startDate, setStartDate] = useState("");
  const [monthlyHours, setMonthlyHours] = useState("120");
  const [monthlyOverride, setMonthlyOverride] = useState("");
  const [mode, setMode] = useState(firstProject?.locationType ?? "remote");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [shift, setShift] = useState("full-day");
  const [laptop, setLaptop] = useState("company");
  const [paidLeaves, setPaidLeaves] = useState("2");
  const [message, setMessage] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const rate = pricing[currency];
  const months = durationMonths(duration);

  const totals = useMemo(() => {
    const hours = Number(monthlyHours) || 0;
    const derivedMonthly = hours * (rate.hourlyRateMinor / 100);
    const monthly = monthlyOverride.trim()
      ? Number(monthlyOverride) || 0
      : derivedMonthly;
    // The per-hire charge applies once, not per month.
    const internship = monthly * months;
    // Per-hire applies below a score of 6 only.
    const perHire = candidate.score < 6 ? rate.perHireMinor / 100 : 0;
    return { monthly, internship, perHire, grand: internship + perHire };
  }, [monthlyHours, monthlyOverride, rate, months, candidate.score]);

  async function onSubmit() {
    const problems = validate({ projectId, roleTitle, duration, startDate, monthlyHours, monthlyOverride, mode, city, laptop, message });
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setNotice(null);
    try {
      const res = await csrfFetch(`/api/employer/${employerId}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internId,
          projectId,
          flowType: "direct",
          currency,
          roleTitle: roleTitle.trim(),
          jd: [message.trim(), restrictions.trim()].filter(Boolean).join("\n\n"),
          mode,
          location: [city.trim(), state.trim()].filter(Boolean).join(", "),
          startDate,
          duration,
          monthlyHours: Number(monthlyHours) || 0,
          ...(monthlyOverride.trim() ? { monthlyAmount: Number(monthlyOverride) } : {}),
          shiftFrom: SHIFT_HOURS[shift]?.[0] ?? "",
          shiftTo: SHIFT_HOURS[shift]?.[1] ?? "",
          laptop,
          paidLeavesPerMonth: Number(paidLeaves) || 0,
          skills: projects.find((p) => p.id === projectId)?.skills ?? [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotice("Proposal sent successfully! Redirecting…");
        setTimeout(() => {
          router.push("/employer/proposals");
        }, 1200);
      } else {
        setNotice(data.error ?? "Failed to send proposal");
      }
    } catch {
      setNotice("Network error occurred");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        {/* ── Candidate ─────────────────────────────────────────────── */}
        <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          <h2 className="text-sm font-semibold text-ink-900">Candidate</h2>
          <div className="mt-4 flex flex-wrap items-start gap-5">
            <span
              aria-hidden
              className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700"
            >
              {candidate.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-900">{candidate.name}</p>
              <p className="text-sm text-text-subtle">{candidate.location || "Location not stated"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-ink-800">
                  <CircleGauge className="size-4 text-ink-400" aria-hidden />
                  {candidate.scored ? `${candidate.score.toFixed(1)}/10` : "Not scored"}
                </span>
                {RATING_META.filter((r) => candidate.ratings[r.key] > 0).map((r) => (
                  <span key={r.key} className="text-xs tabular-nums text-text-subtle">
                    {r.label} {candidate.ratings[r.key]}
                  </span>
                ))}
              </div>
              {candidate.skills.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {candidate.skills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Link
              href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
              className="apple-spring inline-flex min-h-11 items-center rounded-[10px] text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Full profile
            </Link>
          </div>
        </section>

        {/* ── Role ──────────────────────────────────────────────────── */}
        <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          <h2 className="text-sm font-semibold text-ink-900">Role</h2>
          <div className="mt-4 space-y-5">
            {projects.length === 0 ? (
              <p className="rounded-[10px] border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm text-ink-700">
                You have no projects yet. A proposal has to attach to one - create it first.
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
                    if (project.locationType) setMode(project.locationType);
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
              hint="What the candidate sees on the offer."
              onChange={setRoleTitle}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                id="duration"
                label="Duration"
                value={duration}
                options={DURATIONS.filter((d) => !shortOnly || d.value === "1m" || d.value === "2m").map((d) => ({ value: d.value, label: d.label }))}
                error={errors.duration}
                onChange={setDuration}
              />
              <Field
                id="startDate"
                label="Start date"
                type="date"
                value={startDate}
                error={errors.startDate}
                onChange={setStartDate}
              />
            </div>
          </div>
        </section>

        {/* ── Compensation ───────────────────────────────────────────── */}
        <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink-900">Compensation</h2>
            <div
              role="radiogroup"
              aria-label="Currency"
              className="inline-flex rounded-[10px] border border-ink-200 p-0.5"
            >
              {(["INR", "USD"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={currency === code}
                  onClick={() => setCurrency(code)}
                  className={[
                    "apple-spring apple-pressable min-h-11 rounded-md px-3 text-xs font-semibold",
                    currency === code
                      ? "bg-brand-700 text-white"
                      : "text-ink-600 hover:bg-ink-100",
                  ].join(" ")}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-[10px] border border-brand-200 bg-brand-50 p-4">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              {rate.bandName} band
            </p>
            <p className="mt-1 text-sm text-ink-700">{rate.bandBlurb}</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-text-subtle">Published rate</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">
                  {formatRate(rate.hourlyRateMinor, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-subtle">Per-hire charge</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">
                  {formatPerHire(rate.perHireMinor, currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-600">
              <Info className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
              <span>
                {rateCardSource === "plan"
                  ? "Rates come from your plan."
                  : "Standard published rates apply."}{" "}
                A fixed ₹5,000 (or $50) per-hire charge applies across all plans.
              </span>
            </p>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field
              id="monthlyHours"
              label="Hours per month"
              inputMode="numeric"
              value={monthlyHours}
              error={errors.monthlyHours}
              hint="Working hours, not calendar days."
              onChange={(v) => setMonthlyHours(v.replace(/[^\d.]/g, ""))}
            />
            <Field
              id="monthlyAmount"
              label="Monthly amount"
              inputMode="decimal"
              value={monthlyOverride}
              error={errors.monthlyAmount}
              placeholder={totals.monthly.toFixed(0)}
              hint={`Derived: ${formatRate(rate.hourlyRateMinor, currency)} × ${monthlyHours || 0}h. Type a number to override.`}
              onChange={setMonthlyOverride}
            />
          </div>
        </section>

        {/* ── Restrictions ───────────────────────────────────────────── */}
        <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          <h2 className="text-sm font-semibold text-ink-900">Restrictions</h2>
          <p className="mt-1 text-sm text-text-subtle">
            The constraints this offer places on the intern. They are shown to the candidate
            before they accept.
          </p>

          <div className="mt-5 space-y-5">
            <fieldset>
              <legend className="text-sm font-medium text-ink-800">Work mode</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {MODES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={mode === option.value}
                    onClick={() => setMode(option.value)}
                    className={[
                      "apple-spring apple-pressable min-h-11 rounded-full border px-4 text-sm font-medium",
                      mode === option.value
                        ? "border-brand-700 bg-brand-700 text-white"
                        : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {mode !== "remote" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="city"
                  label="City"
                  value={city}
                  error={errors.city}
                  onChange={setCity}
                />
                <Field
                  id="state"
                  label="State"
                  value={state}
                  onChange={setState}
                />
              </div>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                id="shift"
                label="Working hours"
                value={shift}
                options={SHIFT_PRESETS.map((s) => ({ value: s.value, label: s.label }))}
                onChange={setShift}
              />
              <Field
                id="paidLeaves"
                label="Paid leaves per month"
                inputMode="numeric"
                value={paidLeaves}
                onChange={(v) => setPaidLeaves(v.replace(/\D/g, ""))}
              />
            </div>

            <SelectField
              id="laptop"
              label="Laptop"
              value={laptop}
              options={LAPTOP_OPTIONS.map((l) => ({ value: l.value, label: l.label }))}
              hint="Required."
              error={errors.laptop}
              onChange={setLaptop}
            />

            <ReadOnlyField
              id="timezone"
              label="Intern timezone"
              value={firstProject?.timezone ?? "Asia/Kolkata"}
              hint="Owned by the project. Interview slots are offered in this zone."
            />

            <TextArea
              id="restrictions"
              label="Anything else"
              hint="Free text. Be specific - this is the part candidates read to decide."
              rows={3}
              placeholder="No client data on personal devices. Two fixed Saturdays a month for college."
              value={restrictions}
              onChange={setRestrictions}
            />
          </div>
        </section>

        {/* ── Message ───────────────────────────────────────────────── */}
        <section className="rounded-[20px] border border-ink-200/70 bg-white p-6 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          <h2 className="text-sm font-semibold text-ink-900">Message to candidate</h2>
          <div className="mt-4">
            <TextArea
              id="message"
              label="Cover note"
              hint="Plain text. The candidate sees this with your offer."
              rows={6}
              placeholder="What the intern will own, who they will work with, and what success looks like at the end of it."
              value={message}
              error={errors.message}
              onChange={setMessage}
            />
          </div>
        </section>

        {notice ? (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-[10px] border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-ink-700"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>{notice}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSubmit}
            className="apple-spring apple-pressable group inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Send className="size-4" aria-hidden />
            Send proposal
          </button>
          <p className="text-xs text-text-subtle">
            Sending requires the proposals route, which does not exist yet.
          </p>
        </div>
      </div>

      {/* ── Summary ─────────────────────────────────────────────────── */}
      <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <section className="rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
            <Sparkles className="size-3.5" aria-hidden />
            Offer total
          </p>
          <dl className="mt-4 space-y-3">
            <Row label={`Monthly (${months} mo × ${DURATIONS.find((d) => d.value === duration)?.label.toLowerCase()})`}>
              {formatMoney(Math.round(totals.monthly * 100), currency)}
            </Row>
            <Row label="Internship subtotal">
              {formatMoney(Math.round(totals.internship * 100), currency)}
            </Row>
            <Row label="Per-hire charge">
              {formatPerHire(Math.round(totals.perHire * 100), currency)}
            </Row>
            <div className="border-t border-ink-100 pt-3">
              <Row label="Total payable" strong>
                {formatMoney(Math.round(totals.grand * 100), currency)}
              </Row>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-text-subtle">
            Charged when the intern accepts, not when you send this. The per-hire charge applies
            once per hire.
          </p>
        </section>

        <section className="rounded-[20px] border border-brand-200 bg-brand-50 p-5">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            How this offer is priced
          </p>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
            The hourly rate is fixed by their score band, not by you.
            What you can change is the hours, and the monthly figure if you are paying above
            the band.
          </p>
        </section>
      </aside>
    </div>
  );
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
      <dt className="text-sm text-text-subtle">{label}</dt>
      <dd
        className={
          strong
            ? "text-lg font-semibold tabular-nums tracking-tight text-ink-900"
            : "text-sm font-medium tabular-nums text-ink-800"
        }
      >
        {children}
      </dd>
    </div>
  );
}

/* ── Form primitives ────────────────────────────────────────────────────── */

const FIELD_BASE =
  "apple-spring mt-2 min-h-11 w-full rounded-[10px] border bg-white px-3.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus-visible:ring-2";
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
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
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
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
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
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${FIELD_BASE} ${error ? FIELD_BAD : FIELD_OK}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
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
      {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 min-h-11 w-full rounded-[10px] border bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-900 outline-none apple-spring placeholder:text-ink-400 focus-visible:ring-2 ${
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
  monthlyHours: string;
  monthlyOverride: string;
  mode: string;
  city: string;
  laptop: string;
  message: string;
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
  }

  const hours = Number(draft.monthlyHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    errors.monthlyHours = "Enter the working hours for the month.";
  } else if (hours > 240) {
    errors.monthlyHours = "That is more than full time. Check the number.";
  }

  if (draft.monthlyOverride.trim()) {
    const amount = Number(draft.monthlyOverride);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.monthlyAmount = "The override has to be a positive number.";
    }
  }

  if (draft.mode !== "remote" && !draft.city.trim()) {
    errors.city = "An on-site or hybrid role needs a city.";
  }

  if (!draft.laptop) errors.laptop = "Say who provides the laptop.";
  if (draft.message.trim().length < 30) {
    errors.message = "At least a couple of sentences - 30 characters minimum.";
  }

  return errors;
}
