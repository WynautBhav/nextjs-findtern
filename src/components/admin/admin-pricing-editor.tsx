"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, IndianRupee, Loader2, Plus, Save, Star, Trash2 } from "lucide-react";

import { Panel, PanelHeader } from "@/components/admin/panel";
import { Switch } from "@/components/ui/switch";
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
  "apple-spring mt-1.5 min-h-10 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

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
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {seeding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create plans from the built-in rate card
            </button>
            {seedError ? <p className="mt-2 text-xs text-danger">{seedError}</p> : null}
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
        <label className="block w-48 text-xs font-medium text-ink-700">
          Fee (₹)
          <input
            inputMode="decimal"
            value={rupees}
            onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ""))}
            className={inputClass}
          />
        </label>
        <SaveButton state={state} onClick={save} />
        {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
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
          <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
            Active
            <Switch checked={active} onCheckedChange={setActive} aria-label="Plan is active" />
          </label>
        }
      />
      <div className="space-y-4 px-5 py-4">
        <label className="block text-xs font-medium text-ink-700">
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

        <label className="block text-xs font-medium text-ink-700">
          Internship duration
          <input value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ink-700">Comparison table rows</legend>
          {["Who is it for", "Findtern Score", "What you get"].map((label, i) => (
            <input
              key={label}
              aria-label={label}
              placeholder={label}
              value={features[i]}
              onChange={(e) => setFeatures((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              className={inputClass}
            />
          ))}
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium text-ink-700">Card checklist (✓ included / ✗ not included)</legend>
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
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-danger-soft hover:text-danger"
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
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
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
          <p className="text-xs text-text-subtle">
            USD: {formatMoney(inrMinorToUsdMinor(toMinor(hourly)), "USD")}/hr ·{" "}
            {formatMoney(inrMinorToUsdMinor(toMinor(perHire)), "USD")} per hire
          </p>
          <SaveButton state={state} onClick={save} />
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
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
      <label className="block text-xs font-medium text-ink-700">
        {label}
        <input inputMode="decimal" value={now} onChange={(e) => onNow(clean(e.target.value))} className={inputClass} />
      </label>
      <label className="block text-xs font-medium text-ink-700">
        Struck-through &ldquo;was&rdquo;
        <input
          inputMode="decimal"
          value={was}
          placeholder="none"
          onChange={(e) => onWas(clean(e.target.value))}
          className={inputClass}
        />
        <span className="mt-1 block text-2xs font-normal text-text-subtle">
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
      className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
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
