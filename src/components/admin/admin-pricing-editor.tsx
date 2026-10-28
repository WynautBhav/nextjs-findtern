"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, IndianRupee, Loader2, Plus, Save, Star, Trash2 } from "lucide-react";

import { Panel, PanelHeader } from "@/components/admin/panel";
import { buttonClass } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { describeLegacyBand, isLegacyTier, legacyBandChange } from "@/lib/admin/plan-band";
import { csrfFetch } from "@/lib/client-fetch";
import { inrMinorToUsdMinor, savingsPercent } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import type { CmsPlanFeature } from "@/lib/content/types";
import { cn } from "@/lib/utils";

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
  "mt-1.5 h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const toRupees = (minor: number | null) => (minor == null ? "" : String(minor / 100));
const toMinor = (rupees: string) => Math.round(Number(rupees || 0) * 100);
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
      <ActivationFeePanel initialMinor={activationFeeMinor} />

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
              className={buttonClass({ variant: "primary", size: "sm" })}
            >
              {seeding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create plans from the built-in rate card
            </button>
            {seedError ? <p role="alert" className="mt-2 text-sm text-danger">{seedError}</p> : null}
          </div>
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {plans.map((plan) => (
            <PlanEditor key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivationFeePanel({ initialMinor }: { initialMinor: number }) {
  const router = useRouter();
  const [rupees, setRupees] = useState(toRupees(initialMinor));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    const res = await csrfFetch("/api/admin/pricing", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ internActivationFeeMinor: toMinor(rupees) }),
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
  }

  return (
    <Panel>
      <PanelHeader
        title="Intern activation fee"
        description="Charged once to a candidate for the AI interview and onboarding. GST-inclusive. Promo codes apply on top."
        icon={IndianRupee}
      />
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <label className="block w-48 text-sm font-medium text-ink-800">
          Fee (₹)
          <input
            inputMode="decimal"
            value={rupees}
            onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ""))}
            className={inputClass}
          />
        </label>
        <SaveButton state={state} onClick={save} />
        {error ? <p role="alert" className="w-full text-sm text-danger">{error}</p> : null}
      </div>
    </Panel>
  );
}

function PlanEditor({ plan }: { plan: EditablePlan }) {
  const router = useRouter();
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

  const hourlySave = savingsPercent(toMinor(hourly), toMinorOrNull(hourlyWas));
  const perHireSave = savingsPercent(toMinor(perHire), toMinorOrNull(perHireWas));

  async function save() {
    setState("saving");
    setError(null);
    const res = await csrfFetch("/api/admin/pricing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: plan.id,
        displayName: name,
        priceHourlyMinor: toMinor(hourly),
        compareAtHourlyMinor: toMinorOrNull(hourlyWas),
        perHireChargeMinor: toMinor(perHire),
        compareAtPerHireMinor: toMinorOrNull(perHireWas),
        internshipDuration: duration,
        features,
        featureList: featureList.filter((f) => f.label.trim()),
        isFeatured: featured,
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
  }

  return (
    <Panel className={cn(featured && "ring-2 ring-brand-500")}>
      <PanelHeader
        title={plan.displayName}
        description={`slug: ${plan.slug}`}
        action={
          <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
            Active
            <Switch checked={active} onCheckedChange={setActive} aria-label="Plan is active" />
          </label>
        }
      />
      <div className="space-y-4 px-5 py-4">
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
          onNow={setHourly}
          onWas={setHourlyWas}
          save={hourlySave}
        />
        <PriceRow
          label="Per-hire charge (₹)"
          now={perHire}
          was={perHireWas}
          onNow={setPerHire}
          onWas={setPerHireWas}
          save={perHireSave}
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
          <legend className="text-sm font-medium text-ink-800">Card checklist (✓ included / ✗ not included)</legend>
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
                  onChange={(e) =>
                    setFeatureList((prev) => prev.map((row, j) => (j === i ? { ...row, label: e.target.value } : row)))
                  }
                  className={cn(inputClass, "mt-0")}
                />
                <button
                  type="button"
                  onClick={() => setFeatureList((prev) => prev.filter((_, j) => j !== i))}
                  className={cn(buttonClass({ variant: "ghost", size: "iconSm" }), "text-text-subtle hover:bg-danger-soft hover:text-danger")}
                  aria-label="Remove row"
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

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="size-4 accent-brand-700"
          />
          <Star className="size-4 text-accent-500" aria-hidden />
          Mark as &ldquo;Most popular&rdquo;
        </label>

        <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <p className="nums text-xs text-ink-600">
            USD: {formatMoney(inrMinorToUsdMinor(toMinor(hourly)), "USD")}/hr ·{" "}
            {formatMoney(inrMinorToUsdMinor(toMinor(perHire)), "USD")} per hire
          </p>
          <SaveButton state={state} onClick={save} />
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
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
}: {
  label: string;
  now: string;
  was: string;
  onNow: (v: string) => void;
  onWas: (v: string) => void;
  save: number | null;
}) {
  const clean = (v: string) => v.replace(/[^\d.]/g, "");
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm font-medium text-ink-800">
        {label}
        <input inputMode="decimal" value={now} onChange={(e) => onNow(clean(e.target.value))} className={inputClass} />
      </label>
      <label className="block text-sm font-medium text-ink-800">
        Struck-through &ldquo;was&rdquo;
        <input
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

function SaveButton({ state, onClick }: { state: "idle" | "saving" | "saved"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
