"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, IndianRupee, Loader2, Plus, Save, Star, Trash2 } from "lucide-react";

import { EmptyScene } from "@/components/app/primitives";
import { Panel, PanelHeader } from "@/components/admin/panel";
import { buttonClass } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { describeLegacyBand, isLegacyTier, legacyBandChange } from "@/lib/admin/plan-band";
import { csrfFetch } from "@/lib/client-fetch";
import { inrMinorToUsdMinor, savingsPercent } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import type { CmsPlanFeature } from "@/lib/content/types";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/app/use-confirm";

/**
 * Rate card editor. Admins type rupees; the API stores paise. USD is never
 * edited - it is derived at ₹100 = $1 and previewed beside every price.
 */

export type EditablePlan = {
  id: string;
  slug: string;
  displayName: string;
  priceHourlyMinor: number;
  perHireChargeMinor: number;
  compareAtHourlyMinor: number | null;
  compareAtPerHireMinor: number | null;
  internshipDuration: string;
  features: string[];
  featureList: CmsPlanFeature[];
  isFeatured: boolean;
  isActive: boolean;
};

const inputClass =
  "mt-1.5 h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle focus:border-brand-500";

const toRupees = (minor: number | null) => (minor == null ? "" : String(minor / 100));
const toMinor = (rupees: string) => Math.round(Number(rupees || 0) * 100);
/** Paise for a typed rupee amount; null when it is blank, not a number, or beyond what the API stores. */
function parseRupees(raw: string): number | null {
  const t = raw.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const minor = Math.round(Number(t) * 100);
  return Number.isFinite(minor) && minor <= 100_000_000 ? minor : null;
}
const PRICE_ERROR = "Enter a price in rupees, like 450 or 99.50.";

const toMinorOrNull = (rupees: string) => (rupees.trim() === "" ? null : toMinor(rupees));

export function AdminPricingEditor({
  plans,
  activationFeeMinor,
}: {
  plans: EditablePlan[];
  activationFeeMinor: number;
}) {
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  async function seed() {
    setSeeding(true);
    setSeedError(null);
    const res = await csrfFetch("/api/admin/pricing", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSeedError(body.error ?? "Could not create the plans.");
    }
    setSeeding(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header band: the fee on the left, a read-only summary of the saved rate card on the right. */}
      <div className="grid items-stretch gap-[var(--admin-gap,1rem)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ActivationFeePanel initialMinor={activationFeeMinor} />
        <RateCardSummary plans={plans} />
      </div>

      {plans.length === 0 ? (
        <Panel>
          <PanelHeader
            title="No plans in the database"
            description="The public pages are showing the built-in rate card. Create editable rows from it to start changing prices."
            icon={IndianRupee}
          />
          <div className="px-5 py-4">
            <button
              type="button"
              onClick={seed}
              disabled={seeding}
              // Wraps on a phone; the label ran 24px past its box (QA-143).
              className={buttonClass({ variant: "primary", size: "sm", className: "h-auto min-h-9 whitespace-normal py-2 text-left" })}
            >
              {seeding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create plans from the built-in rate card
            </button>
            {seedError ? <p role="alert" className="mt-2 text-sm text-danger">{seedError}</p> : null}
          </div>
        </Panel>
      ) : (
        // Columns follow the width of this area, not the viewport: the admin sidebar takes ~340px,
        // so a viewport breakpoint left the third card alone on its own row at 1440. One column
        // when narrow, two from 36rem, three from 56rem. Each card keeps its own form and Save.
        <div className="@container">
          <div className="grid items-start gap-[var(--admin-gap,1rem)] @xl:grid-cols-2 @4xl:grid-cols-3">
            {plans.map((plan) => (
              <PlanEditor key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The saved rate card at a glance (from the loaded rows; edits show here after a save). */
function RateCardSummary({ plans }: { plans: EditablePlan[] }) {
  return (
    <Panel>
      <PanelHeader title="Rate card" description="As saved: what the public pricing page shows." icon={IndianRupee} />
      {plans.length === 0 ? (
        <EmptyScene compact title="No plans on the rate card" body="Plans show here, and on the public pricing page, once one is saved in the editor." />
      ) : (
        <ul className="divide-y divide-[color:var(--admin-rule)] px-5 pb-2 text-sm">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate font-medium text-ink-800">
                {p.displayName}
                {p.isFeatured ? <Star className="ml-1.5 inline size-3.5 text-accent-700" aria-label="Most popular" /> : null}
                {!p.isActive ? <span className="ml-2 text-xs font-normal text-text-subtle">off</span> : null}
              </span>
              <span className="nums shrink-0 text-ink-600">
                {formatMoney(p.priceHourlyMinor, "INR")}/hr · {formatMoney(p.perHireChargeMinor, "INR")}/hire
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ActivationFeePanel({ initialMinor }: { initialMinor: number }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [rupees, setRupees] = useState(toRupees(initialMinor));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const fee = parseRupees(rupees);
    if (fee === null || fee <= 0) {
      setError(fee === 0 ? "The fee must be above zero." : PRICE_ERROR);
      document.getElementById("activation-fee")?.focus();
      return;
    }
    const ok = await ask({
      title: "Publish this activation fee?",
      body: `New candidates are charged ${formatMoney(fee, "INR")} (GST-inclusive) from now on.`,
      confirmLabel: "Yes, publish",
    });
    if (!ok) return;
    setState("saving");
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/pricing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ internActivationFeeMinor: fee }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save.");
        setState("idle");
        return;
      }
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setError("Not saved: the network request failed.");
      setState("idle");
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Intern activation fee"
        description="Charged once to a candidate for the AI interview and onboarding. GST-inclusive. Promo codes apply on top."
        icon={IndianRupee}
      />
      {dialog}
      <form onSubmit={save} noValidate className="flex flex-wrap items-end gap-3 px-5 py-4">
        <label className="block w-full max-w-48 text-sm font-medium text-ink-800">
          Fee (₹)
          <input
            id="activation-fee"
            inputMode="decimal"
            value={rupees}
            onChange={(e) => {
              setRupees(e.target.value.replace(/[^\d.]/g, ""));
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "activation-fee-error" : undefined}
            className={inputClass}
          />
        </label>
        <SaveButton state={state} />
        {error ? <p id="activation-fee-error" role="alert" className="w-full text-sm text-danger">{error}</p> : null}
      </form>
    </Panel>
  );
}

function PlanEditor({ plan }: { plan: EditablePlan }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [name, setName] = useState(plan.displayName);
  const [hourly, setHourly] = useState(toRupees(plan.priceHourlyMinor));
  const [hourlyWas, setHourlyWas] = useState(toRupees(plan.compareAtHourlyMinor));
  const [perHire, setPerHire] = useState(toRupees(plan.perHireChargeMinor));
  const [perHireWas, setPerHireWas] = useState(toRupees(plan.compareAtPerHireMinor));
  const [duration, setDuration] = useState(plan.internshipDuration);
  const [features, setFeatures] = useState<string[]>([0, 1, 2].map((i) => plan.features[i] ?? ""));
  const [featureList, setFeatureList] = useState<CmsPlanFeature[]>(plan.featureList);
  const [featured, setFeatured] = useState(plan.isFeatured);
  const [active, setActive] = useState(plan.isActive);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  /** The price field (its id) the error is about, so it is marked invalid and focused. */
  const [badField, setBadField] = useState<string | null>(null);
  const fid = (k: string) => `${plan.id}-${k}`;

  // Re-sync from the server copy after router.refresh(). Featured is its own effect: saving
  // another card as "Most popular" un-features this one on the server, and that must not
  // wipe whatever is half-typed here.
  // (Adjusting state during render, keyed on the server copy, rather than in an effect.)
  const [seenFeatured, setSeenFeatured] = useState(plan.isFeatured);
  if (seenFeatured !== plan.isFeatured) {
    setSeenFeatured(plan.isFeatured);
    setFeatured(plan.isFeatured);
  }
  const serverSig = JSON.stringify({ ...plan, isFeatured: null });
  const [seenSig, setSeenSig] = useState(serverSig);
  if (seenSig !== serverSig) {
    setSeenSig(serverSig);
    setName(plan.displayName);
    setHourly(toRupees(plan.priceHourlyMinor));
    setHourlyWas(toRupees(plan.compareAtHourlyMinor));
    setPerHire(toRupees(plan.perHireChargeMinor));
    setPerHireWas(toRupees(plan.compareAtPerHireMinor));
    setDuration(plan.internshipDuration);
    setFeatures([0, 1, 2].map((i) => plan.features[i] ?? ""));
    setFeatureList(plan.featureList);
    setActive(plan.isActive);
  }

  const dirty =
    name.trim() !== plan.displayName.trim() ||
    toMinor(hourly) !== plan.priceHourlyMinor ||
    toMinor(perHire) !== plan.perHireChargeMinor ||
    toMinorOrNull(hourlyWas) !== plan.compareAtHourlyMinor ||
    toMinorOrNull(perHireWas) !== plan.compareAtPerHireMinor ||
    duration !== plan.internshipDuration ||
    features.some((v, i) => v !== (plan.features[i] ?? "")) ||
    JSON.stringify(featureList.filter((f) => f.label.trim())) !== JSON.stringify(plan.featureList) ||
    featured !== plan.isFeatured ||
    active !== plan.isActive;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const hourlySave = savingsPercent(toMinor(hourly), toMinorOrNull(hourlyWas));
  const perHireSave = savingsPercent(toMinor(perHire), toMinorOrNull(perHireWas));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // A blank or garbled price must never be coerced to ₹0 and published.
    const checks: [string, string, boolean][] = [
      ["hourly", hourly, true],
      ["perHire", perHire, true],
      ["hourlyWas", hourlyWas, false],
      ["perHireWas", perHireWas, false],
    ];
    for (const [key, raw, required] of checks) {
      if ((required || raw.trim() !== "") && parseRupees(raw) === null) {
        setBadField(fid(key));
        setError(PRICE_ERROR);
        document.getElementById(fid(key))?.focus();
        return;
      }
    }
    const hourlyMinor = parseRupees(hourly)!;
    const perHireMinor = parseRupees(perHire)!;
    const ok = await ask({
      title: `Publish new prices for ${name.trim() || plan.displayName}?`,
      body: `${formatMoney(hourlyMinor, "INR")} per hour and ${formatMoney(perHireMinor, "INR")} per hire${active ? "" : " (the plan is switched off)"}. The public pricing page updates straight away.`,
      confirmLabel: "Yes, publish",
    });
    if (!ok) return;
    setState("saving");
    setError(null);
    setBadField(null);
    try {
      const res = await csrfFetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: plan.id,
          displayName: name,
          priceHourlyMinor: hourlyMinor,
          compareAtHourlyMinor: parseRupees(hourlyWas),
          perHireChargeMinor: perHireMinor,
          compareAtPerHireMinor: parseRupees(perHireWas),
          internshipDuration: duration,
          features,
          featureList: featureList.filter((f) => f.label.trim()),
          // Only when the admin changed it: re-sending a stale value would re-feature this
          // plan and un-feature whichever card was saved as "Most popular" since.
          ...(featured !== plan.isFeatured ? { isFeatured: featured } : {}),
          isActive: active,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save.");
        setState("idle");
        return;
      }
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setError("Not saved: the network request failed.");
      setState("idle");
    }
  }

  return (
    <Panel className={cn("@container", featured && "ring-2 ring-brand-500")}>
      <PanelHeader
        title={plan.displayName}
        description={`slug: ${plan.slug}`}
        action={
          <div className="flex items-center gap-3">
            {dirty ? (
              <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700">
                Unsaved changes
              </span>
            ) : null}
            <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
              Active
              <Switch checked={active} onCheckedChange={setActive} aria-label="Plan is active" />
            </label>
          </div>
        }
      />
      {dialog}
      <form onSubmit={save} noValidate className="space-y-4 px-5 py-4">
        {plan.isActive && !active && isLegacyTier(plan.features[1]) ? (
          <Warning>
            Switching this plan off also removes the {describeLegacyBand(plan.features[1])} price on the legacy site
            (still the rollback target). Candidates in that band would be priced from another plan there.
          </Warning>
        ) : null}
        <label className="block text-sm font-medium text-ink-800">
          Display name
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>

        <PriceRow
          label="Hourly rate (₹/hr)"
          now={hourly}
          was={hourlyWas}
          onNow={(v) => {
            setHourly(v);
            setBadField(null);
          }}
          onWas={(v) => {
            setHourlyWas(v);
            setBadField(null);
          }}
          save={hourlySave}
          ids={[fid("hourly"), fid("hourlyWas")]}
          badId={badField}
          errorId={fid("error")}
        />
        <PriceRow
          label="Per-hire charge (₹)"
          now={perHire}
          was={perHireWas}
          onNow={(v) => {
            setPerHire(v);
            setBadField(null);
          }}
          onWas={(v) => {
            setPerHireWas(v);
            setBadField(null);
          }}
          save={perHireSave}
          ids={[fid("perHire"), fid("perHireWas")]}
          badId={badField}
          errorId={fid("error")}
        />

        <label className="block text-sm font-medium text-ink-800">
          Internship duration
          <input value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-800">Comparison table rows</legend>
          {["Who is it for", "Findtern Score", "What you get"].map((label, i) => (
            <label key={label} className="block text-xs font-medium text-ink-600">
              {label}
              <input
                value={features[i]}
                aria-describedby={i === 1 ? `band-${plan.id}` : undefined}
                onChange={(e) => setFeatures((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                className={cn(inputClass, "mt-1")}
              />
            </label>
          ))}
          <LegacyBandNote id={`band-${plan.id}`} previous={plan.features[1]} next={features[1]} />
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-ink-800">Card checklist <span className="font-normal text-ink-600">(switch on: the plan includes it)</span></legend>
          <ul className="mt-1.5 space-y-2">
            {featureList.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <Switch
                  checked={f.included}
                  onCheckedChange={(included) =>
                    setFeatureList((prev) => prev.map((row, j) => (j === i ? { ...row, included } : row)))
                  }
                  aria-label={`${f.label || "Row"} included`}
                />
                <input
                  value={f.label}
                  aria-label={`Checklist row ${i + 1}`}
                  onChange={(e) =>
                    setFeatureList((prev) => prev.map((row, j) => (j === i ? { ...row, label: e.target.value } : row)))
                  }
                  className={cn(inputClass, "mt-0 min-w-0 flex-1")}
                />
                <button
                  type="button"
                  onClick={() => setFeatureList((prev) => prev.filter((_, j) => j !== i))}
                  className={cn(buttonClass({ variant: "ghost", size: "iconSm" }), "text-text-subtle hover:bg-danger-soft hover:text-danger")}
                  aria-label={`Remove checklist row ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setFeatureList((prev) => [...prev, { label: "", included: true }])}
            className={cn(buttonClass({ variant: "ghost", size: "sm" }), "mt-2")}
          >
            <Plus className="size-3.5" /> Add row
          </button>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-ink-700 touch:min-h-11">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="size-4 accent-brand-700"
          />
          <Star className="size-4 text-accent-700" aria-hidden />
          Mark as &ldquo;Most popular&rdquo;
        </label>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--admin-rule)] pt-4">
          <p className="nums text-xs text-ink-600">
            USD: {formatMoney(inrMinorToUsdMinor(toMinor(hourly)), "USD")}/hr ·{" "}
            {formatMoney(inrMinorToUsdMinor(toMinor(perHire)), "USD")} per hire
          </p>
          <SaveButton state={state} />
        </div>
        {error ? <p id={fid("error")} role="alert" className="text-sm text-danger">{error}</p> : null}
      </form>
    </Panel>
  );
}

function PriceRow({
  label,
  now,
  was,
  onNow,
  onWas,
  save,
  ids,
  badId,
  errorId,
}: {
  label: string;
  now: string;
  was: string;
  onNow: (v: string) => void;
  onWas: (v: string) => void;
  save: number | null;
  /** DOM ids of the "now" and "was" inputs. */
  ids: [string, string];
  /** The id of the input the current error is about, if it is one of these. */
  badId: string | null;
  errorId: string;
}) {
  const bad = (id: string) => (badId === id ? ({ "aria-invalid": true, "aria-describedby": errorId } as const) : {});
  const clean = (v: string) => v.replace(/[^\d.]/g, "");
  return (
    <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
      <label className="block text-sm font-medium text-ink-800">
        {label}
        <input id={ids[0]} {...bad(ids[0])} inputMode="decimal" value={now} onChange={(e) => onNow(clean(e.target.value))} className={inputClass} />
      </label>
      <label className="block text-sm font-medium text-ink-800">
        Struck-through &ldquo;was&rdquo;
        <input
          id={ids[1]}
          {...bad(ids[1])}
          inputMode="decimal"
          value={was}
          placeholder="none"
          onChange={(e) => onWas(clean(e.target.value))}
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-ink-600">
          {save != null ? `Shows "Save ${save}%"` : was ? "Must be above the price to show" : "Leave blank to hide"}
        </span>
      </label>
    </div>
  );
}

function SaveButton({ state }: { state: "idle" | "saving" | "saved" }) {
  return (
    <button
      type="submit"
      disabled={state === "saving"}
      className={buttonClass({ variant: "primary", size: "sm" })}
    >
      {state === "saving" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : state === "saved" ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <Save className="size-3.5" />
      )}
      {state === "saved" ? "Saved" : "Save"}
    </button>
  );
}

function Warning({ children, id, danger }: { children: React.ReactNode; id?: string; danger?: boolean }) {
  return (
    <p
      id={id}
      role={danger ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-apple-sm px-3 py-2.5 text-sm leading-relaxed",
        danger ? "bg-danger-soft text-danger" : "bg-accent-100 text-accent-700",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** DB-26: what the legacy site will make of the "Findtern Score" row. */
function LegacyBandNote({ id, previous, next }: { id: string; previous?: string; next: string }) {
  const change = legacyBandChange(previous, next);
  if (change) {
    return (
      <Warning id={id} danger={change.block}>
        {change.message}
        {change.block ? " Saving is refused until it can." : ""}
      </Warning>
    );
  }
  const band = describeLegacyBand(next);
  return (
    <p id={id} className="text-xs text-ink-600">
      {band
        ? `The legacy site reads this row to price candidates (${band}). Keep the numbers in the same form.`
        : "The legacy site doesn't read this row as a score band (the lowest plan usually isn't)."}
    </p>
  );
}
