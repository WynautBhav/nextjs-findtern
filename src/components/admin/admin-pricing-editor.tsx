"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Save, Star } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { AutosaveStatus, useAutosave, type SaveResult } from "@/components/admin/use-autosave";
import { buttonClass } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { createAutosave } from "@/lib/admin/autosave";
import type { SubscriptionConfig } from "@/lib/employer-subscription";
import { draftFromConfig, subscriptionDraftEq, usdPreviewMinor, validateSubscriptionDraft, type SubscriptionDraft } from "@/lib/subscription/draft";
import { describeLegacyBand, isLegacyTier, legacyBandChange } from "@/lib/admin/plan-band";
import {
  planDraftEq,
  planDraftFromPlan,
  planPatchBody,
  rupeesEq,
  toRupees,
  validateActivationFee,
  validatePlanDraft,
  validateStipends,
  wholeRupeesEq,
  type PlanDraft,
  type StipendDraft,
} from "@/lib/admin/pricing-draft";
import { csrfFetch } from "@/lib/client-fetch";
import { FEE_BANDS, FEE_BAND_LABEL, type FeeBand, type PerHireFeeSetting } from "@/lib/per-hire-fee";
import { INR_PER_USD, inrMinorToUsdMinor, savingsPercent } from "@/lib/currency";
import type { StipendBands } from "@/lib/pricing-config";
import { formatMoney } from "@/lib/format";
import type { CmsPlanFeature } from "@/lib/content/types";
import { cn } from "@/lib/utils";

/**
 * Rate card editor. Admins type rupees; the API stores paise. USD is never
 * edited - it is derived at ₹100 = $1 and previewed beside every price.
 *
 * Every block saves by itself a moment after the last edit (see use-autosave):
 * a plan card, the activation fee, the hiring-fee switches, the stipends, and the
 * one "Most popular" choice. Each shows its own Saving… / Saved / Error state.
 * A save is live on the public site at once, so there is no confirm dialog; each
 * block shows "Live on the site" and an Undo for its last change instead.
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
  "mt-1.5 h-10 w-full rounded-md border border-ink-300 bg-surface-raised px-3 text-base sm:text-sm text-ink-900 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-ink-600 focus:border-brand-700 read-only:bg-transparent aria-invalid:border-danger aria-invalid:focus:border-danger";

/** A ruled block: the name and what it does on the left, the controls on the right. Not a card. */
function Block({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-x-12 gap-y-4 border-t border-ink-200 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
        {hint ? <p className="mt-1 max-w-prose text-pretty text-sm text-ink-700">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const toMinor = (rupees: string) => Math.round(Number(rupees || 0) * 100);
const toMinorOrNull = (rupees: string) => (rupees.trim() === "" ? null : toMinor(rupees));

const planMachine = createAutosave<PlanDraft>(planDraftEq);
const feeMachine = createAutosave<string>(rupeesEq);
const hireFeeMachine = createAutosave<PerHireFeeSetting>((a, b) => FEE_BANDS.every((k) => a[k] === b[k]));
const stipendMachine = createAutosave<StipendDraft>((a, b) => wholeRupeesEq(a.skilled, b.skilled) && wholeRupeesEq(a.assured, b.assured));
const featuredMachine = createAutosave<string | null>((a, b) => a === b);
const subscriptionMachine = createAutosave<SubscriptionDraft>(subscriptionDraftEq);

/** One request to the pricing API; the server's message when it refuses. */
async function send(method: "PATCH" | "PUT", body: unknown): Promise<SaveResult> {
  try {
    const res = await csrfFetch("/api/admin/pricing", {
      method,
      headers: { "content-type": "application/json" },
      // keepalive: a save fired as the tab is hidden still goes out.
      keepalive: true,
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? "Could not save." };
  } catch {
    return { ok: false, error: "Not saved: the network request failed." };
  }
}

export function AdminPricingEditor({
  plans,
  activationFeeMinor,
  perHireFee,
  stipendBands,
  subscription,
  mayEditSubscription = false,
}: {
  plans: EditablePlan[];
  activationFeeMinor: number;
  perHireFee: PerHireFeeSetting;
  stipendBands: StipendBands;
  /** Findtern Pro as saved; the block is hidden when absent. */
  subscription?: SubscriptionConfig;
  /** Saving it needs the Accounts permission on top of this page's; without it the block is read-only. */
  mayEditSubscription?: boolean;
}) {
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  // "Most popular" is one choice for the whole rate card, saved on its own: ticking a card
  // unticks the others at once (before the save), and the server un-features them in the
  // same transaction. The page loads with at most one (settings/page.tsx heals duplicates).
  const serverFeaturedId = plans.find((p) => p.isFeatured)?.id ?? null;
  const featured = useAutosave(
    featuredMachine,
    serverFeaturedId,
    // Un-ticking sends the plan that held the flag; ticking sends the new one.
    (value, saved) => (value ?? saved ? send("PATCH", { id: (value ?? saved)!, isFeatured: value !== null }) : Promise.resolve({ ok: true })),
    () => router.refresh(),
  );
  const featuredId = featured.state.draft;

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
    <div>
      <ActivationFeePanel initialMinor={activationFeeMinor} />
      <PerHireFeePanel initial={perHireFee} />
      <StipendPanel initial={stipendBands} />
      {subscription ? <SubscriptionPanel initial={subscription} editable={mayEditSubscription} /> : null}

      {plans.length === 0 ? (
        <Block title="No plans in the database" hint="The public pages are showing the built-in rate card. Create editable rows from it to start changing prices.">
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
        </Block>
      ) : (
        <section className="border-t border-ink-200 py-6">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink-900">Plans</h2>
              <p className="mt-1 max-w-prose text-pretty text-sm text-ink-700">
                What the public pricing page shows. Each plan saves on its own. One plan at a time is marked Most popular; ticking another moves it.
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <p className="text-ink-700">
                Most popular: <strong className="font-semibold text-ink-900">{plans.find((p) => p.id === featuredId)?.displayName ?? "none marked"}</strong>
              </p>
              <AutosaveStatus auto={featured} />
            </div>
          </div>
          {/* Columns follow the width of this area, not the viewport: the admin sidebar takes ~340px,
              so a viewport breakpoint left the third card alone on its own row at 1440. One column
              when narrow, two from 36rem, three from 56rem. Each plan saves on its own. */}
          <div className="@container mt-6">
            <div className="grid items-start gap-x-10 gap-y-10 @xl:grid-cols-2 @4xl:grid-cols-3">
              {plans.map((plan) => (
                <PlanEditor
                  key={plan.id}
                  plan={plan}
                  featured={featuredId === plan.id}
                  onFeatured={(on) => featured.edit(on ? plan.id : null)}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ActivationFeePanel({ initialMinor }: { initialMinor: number }) {
  const router = useRouter();
  const auto = useAutosave(
    feeMachine,
    toRupees(initialMinor),
    async (rupees) => {
      const fee = validateActivationFee(rupees);
      return fee.ok ? send("PUT", { internActivationFeeMinor: fee.minor }) : { ok: false, error: fee.message };
    },
    () => router.refresh(),
  );
  const rupees = auto.state.draft;
  const check = validateActivationFee(rupees);
  const error = auto.status === "invalid" && !check.ok ? check.message : null;

  return (
    <Block title="Intern activation fee" hint="Charged once to a candidate for the AI interview and onboarding. GST-inclusive. Promo codes apply on top.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          auto.flush();
        }}
        noValidate
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full max-w-48 text-sm font-medium text-ink-900">
            Fee (₹)
            <input
              id="activation-fee"
              inputMode="decimal"
              value={rupees}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                const c = validateActivationFee(v);
                auto.edit(v, c.ok ? null : c.message);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "activation-fee-error" : undefined}
              className={inputClass}
            />
          </label>
          <SaveNowButton enabled={auto.state.sending === null && auto.status === "pending"} />
        </div>
        {error ? <p id="activation-fee-error" role="alert" className="text-sm text-danger">{error}</p> : null}
        <AutosaveStatus auto={auto} />
      </form>
    </Block>
  );
}

/**
 * Which score bands pay the one-time hiring fee. Each switch saves at once; the block
 * says Saving…/Saved, and on a failure it shows the server's message with Retry (the
 * switch stays where it was flipped until you retry or discard).
 */
function PerHireFeePanel({ initial }: { initial: PerHireFeeSetting }) {
  const auto = useAutosave(hireFeeMachine, initial, (bands) => send("PUT", { perHireFeeBands: bands }));
  const stored = auto.state.draft;

  return (
    <Block title="Charge one-time hiring fee" hint="Applies to offers not yet paid and to new payments. Invoices already paid are never changed.">
      <div className="space-y-1">
        <p className="text-sm text-ink-700">
          Espresso hires with no stipend (score under 6) have nothing else to pay, so switching Espresso off leaves them with nothing payable at checkout.
        </p>
        <ul className="divide-y divide-ink-200">
          {FEE_BANDS.map((band: FeeBand) => {
            const label = FEE_BAND_LABEL[band];
            const id = `per-hire-fee-${band}`;
            return (
              <li key={band} className="flex items-center justify-between gap-4 py-3">
                <label htmlFor={id} className="text-sm font-medium text-ink-900">
                  {label.plan} (score {label.scores})
                  <span className="block text-xs font-normal text-ink-600">
                    {stored[band] ? "Charged with the first payment" : "Free for now"}
                  </span>
                </label>
                <Switch id={id} checked={stored[band]} onCheckedChange={(next) => auto.edit({ ...stored, [band]: next }, null, true)} />
              </li>
            );
          })}
        </ul>
        <AutosaveStatus auto={auto} />
      </div>
    </Block>
  );
}

/**
 * The fixed monthly intern stipend per score band. Espresso (score under 6)
 * is not paid one. Cappuccino and Latte are typed in whole rupees and sent as
 * paise in one save. The score ranges and the USD rule are fixed, shown only.
 */
function StipendPanel({ initial }: { initial: StipendBands }) {
  const router = useRouter();
  const auto = useAutosave(
    stipendMachine,
    { skilled: toRupees(initial.skilled), assured: toRupees(initial.assured) },
    async (d) => {
      const r = validateStipends(d);
      return r.ok ? send("PUT", { internStipendBands: r.bands }) : { ok: false, error: r.message };
    },
    () => router.refresh(),
  );
  const draft = auto.state.draft;
  const check = validateStipends(draft);
  const bad = auto.status === "invalid" && !check.ok ? check : null;

  const fields = [
    { band: "skilled" as const, value: draft.skilled },
    { band: "assured" as const, value: draft.assured },
  ];

  return (
    <Block title="Intern monthly stipend" hint="The fixed amount a hired intern is paid each month, by Findtern Score. Cappuccino and Latte only.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          auto.flush();
        }}
        noValidate
        className="space-y-4"
      >
        <ul className="divide-y divide-ink-200">
          <li className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-medium text-ink-900">
              {FEE_BAND_LABEL.standard.plan} (score {FEE_BAND_LABEL.standard.scores.replace("-", "–")})
              <span className="block text-xs font-normal text-ink-600">No stipend: a score under 6 is not paid one</span>
            </span>
            <span className="text-sm text-ink-700">None</span>
          </li>
          {fields.map((f) => {
            const id = `stipend-${f.band}`;
            const label = FEE_BAND_LABEL[f.band];
            return (
              <li key={f.band} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <label htmlFor={id} className="text-sm font-medium text-ink-900">
                  {label.plan} (score {label.scores.replace("-", "–")})
                  <span className="block text-xs font-normal text-ink-600">Per month, in whole rupees</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-600" aria-hidden>₹</span>
                  <input
                    id={id}
                    inputMode="numeric"
                    value={f.value}
                    onChange={(e) => {
                      const next = { ...draft, [f.band]: e.target.value.replace(/\D/g, "") };
                      const c = validateStipends(next);
                      auto.edit(next, c.ok ? null : c.message);
                    }}
                    aria-invalid={bad?.field === f.band ? true : undefined}
                    aria-describedby={bad?.field === f.band ? "stipend-error" : undefined}
                    className={cn(inputClass, "mt-0 w-36")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-600">The score ranges and the USD rate (₹{INR_PER_USD} = $1) are fixed.</p>
          <SaveNowButton enabled={auto.state.sending === null && auto.status === "pending"} />
        </div>
        {bad ? <p id="stipend-error" role="alert" className="text-sm text-danger">{bad.message}</p> : null}
        <AutosaveStatus auto={auto} />
      </form>
    </Block>
  );
}

/**
 * Findtern Pro: the employer subscription's price (rupees, GST-inclusive), length and on/off switch. Autosaves like the other
 * blocks. USD is derived (₹100 = $1), never typed. Switching it off hides the offer and puts every employer back to no access;
 * paid orders and their invoices stay as they are.
 */
function SubscriptionPanel({ initial, editable }: { initial: SubscriptionConfig; editable: boolean }) {
  const router = useRouter();
  const auto = useAutosave(
    subscriptionMachine,
    draftFromConfig(initial),
    async (d) => {
      const r = validateSubscriptionDraft(d);
      return r.ok ? send("PUT", { employerSubscription: r.config }) : { ok: false, error: r.message };
    },
    () => router.refresh(),
  );
  const draft = auto.state.draft;
  const check = validateSubscriptionDraft(draft);
  const bad = auto.status === "invalid" && !check.ok ? check : null;
  const usd = usdPreviewMinor(draft.price);

  return (
    <Block title="Findtern Pro employer subscription" hint="Unlocks the CGPA filter and the college filter and sort on Candidates. Paying while active adds the days to the current end.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          auto.flush();
        }}
        noValidate
        className="space-y-4"
      >
        <ul className="divide-y divide-ink-200">
          <li className="flex items-center justify-between gap-4 py-3">
            <label htmlFor="subscription-enabled" className="text-sm font-medium text-ink-900">
              On sale
              <span className="block text-xs font-normal text-ink-600">
                {draft.enabled ? "Employers can buy it and active ones keep their access" : "Off: nobody has access and nobody can buy it. Paid orders stay on record"}
              </span>
            </label>
            <Switch
              id="subscription-enabled"
              checked={draft.enabled}
              disabled={!editable}
              onCheckedChange={(next) => auto.edit({ ...draft, enabled: next }, null, true)}
            />
          </li>
          <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <label htmlFor="subscription-price" className="text-sm font-medium text-ink-900">
              Price
              <span className="block text-xs font-normal text-ink-600">
                Rupees, GST-inclusive.{" "}
                {usd !== null ? <span className="nums">Charged as {formatMoney(usd, "USD")} to employers outside India.</span> : "Dollars are derived at ₹100 = $1."}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-600" aria-hidden>₹</span>
              <input
                id="subscription-price"
                inputMode="decimal"
                value={draft.price}
                readOnly={!editable}
                onChange={(e) => {
                  const next = { ...draft, price: e.target.value.replace(/[^\d.]/g, "") };
                  const c = validateSubscriptionDraft(next);
                  auto.edit(next, c.ok || c.field !== "price" ? null : c.message);
                }}
                aria-invalid={bad?.field === "price" ? true : undefined}
                aria-describedby={bad?.field === "price" ? "subscription-error" : undefined}
                className={cn(inputClass, "mt-0 w-36")}
              />
            </div>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <label htmlFor="subscription-days" className="text-sm font-medium text-ink-900">
              Length
              <span className="block text-xs font-normal text-ink-600">Days of access per purchase, 1 to 1095. A paid order keeps the length it was bought with.</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="subscription-days"
                inputMode="numeric"
                value={draft.days}
                readOnly={!editable}
                onChange={(e) => {
                  const next = { ...draft, days: e.target.value.replace(/\D/g, "") };
                  const c = validateSubscriptionDraft(next);
                  auto.edit(next, c.ok || c.field !== "days" ? null : c.message);
                }}
                aria-invalid={bad?.field === "days" ? true : undefined}
                aria-describedby={bad?.field === "days" ? "subscription-error" : undefined}
                className={cn(inputClass, "mt-0 w-28")}
              />
              <span className="text-sm text-ink-600" aria-hidden>days</span>
            </div>
          </li>
        </ul>
        {editable ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SaveNowButton enabled={auto.state.sending === null && auto.status === "pending"} />
          </div>
        ) : (
          <p className="text-sm text-ink-700">Changing the Findtern Pro price needs the Accounts permission. You can see it here.</p>
        )}
        {bad ? <p id="subscription-error" role="alert" className="text-sm text-danger">{bad.message}</p> : null}
        <AutosaveStatus auto={auto} live="Live: employers see this now" />
      </form>
    </Block>
  );
}

function PlanEditor({
  plan,
  featured,
  onFeatured,
}: {
  plan: EditablePlan;
  /** Whether this card is the page's "Most popular" choice (unsaved included); the parent keeps it to one. */
  featured: boolean;
  onFeatured: (on: boolean) => void;
}) {
  const router = useRouter();
  // Everything but "Most popular" (the parent's one choice) saves from here: PATCH with the whole card.
  const auto = useAutosave(
    planMachine,
    planDraftFromPlan(plan),
    (draft) => send("PATCH", planPatchBody(plan.id, draft)),
    () => router.refresh(),
  );
  const d = auto.state.draft;
  const saved = auto.state.saved;
  const issue = validatePlanDraft(d, saved.features);
  const fid = (k: string) => `${plan.id}-${k}`;
  const bad = (field: string, extra = true) => (issue?.field === field && extra ? ({ "aria-invalid": true, "aria-describedby": fid("error") } as const) : {});

  /** Applies one edit to the draft; invalid values stay on screen but are not saved. `immediate` for switches. */
  function change(patch: Partial<PlanDraft>, immediate = false) {
    const next = { ...d, ...patch };
    auto.edit(next, validatePlanDraft(next, saved.features)?.message ?? null, immediate);
  }

  const hourlySave = savingsPercent(toMinor(d.hourly), toMinorOrNull(d.hourlyWas));
  const perHireSave = savingsPercent(toMinor(d.perHire), toMinorOrNull(d.perHireWas));
  const bandChange = legacyBandChange(saved.features[1], d.features[1]);

  return (
    <div className="@container min-w-0">
      <div className="flex items-start justify-between gap-3 border-b border-ink-200 pb-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-lg font-semibold text-ink-900">
            {plan.displayName}
            {featured ? <Pill tone="live" icon={<Star aria-hidden />}>Most popular</Pill> : null}
          </h3>
          <p className="mt-0.5 text-sm text-ink-600">{`slug: ${plan.slug}`}</p>
        </div>
        <label className="flex min-h-8 shrink-0 items-center gap-2 text-sm font-medium text-ink-700">
          Active
          <Switch checked={d.active} onCheckedChange={(active) => change({ active }, true)} aria-label="Plan is active" />
        </label>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          auto.flush();
        }}
        noValidate
        className="space-y-4 pt-4"
      >
        {saved.active && !d.active && isLegacyTier(saved.features[1]) ? (
          <Warning>
            Switching this plan off also removes the {describeLegacyBand(saved.features[1])} price on the legacy site
            (still the rollback target). Candidates in that band would be priced from another plan there.
          </Warning>
        ) : null}
        <label className="block text-sm font-medium text-ink-900">
          Display name
          <input value={d.name} onChange={(e) => change({ name: e.target.value })} {...bad("name")} className={inputClass} />
        </label>

        <PriceRow
          label="Hourly rate (₹/hr)"
          now={d.hourly}
          was={d.hourlyWas}
          onNow={(v) => change({ hourly: v })}
          onWas={(v) => change({ hourlyWas: v })}
          save={hourlySave}
          ids={[fid("hourly"), fid("hourlyWas")]}
          badId={issue ? fid(issue.field) : null}
          errorId={fid("error")}
        />
        <PriceRow
          label="Per-hire charge (₹)"
          now={d.perHire}
          was={d.perHireWas}
          onNow={(v) => change({ perHire: v })}
          onWas={(v) => change({ perHireWas: v })}
          save={perHireSave}
          ids={[fid("perHire"), fid("perHireWas")]}
          badId={issue ? fid(issue.field) : null}
          errorId={fid("error")}
        />

        <label className="block text-sm font-medium text-ink-900">
          Internship duration
          <input value={d.duration} onChange={(e) => change({ duration: e.target.value })} {...bad("duration")} className={inputClass} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-900">Comparison table rows</legend>
          {["Who is it for", "Findtern Score", "What you get"].map((label, i) => (
            <label key={label} className="block text-xs font-medium text-ink-600">
              {label}
              <input
                value={d.features[i]}
                {...bad("features", i === 1 || d.features[i].trim().length > 120)}
                {...(i === 1 ? { "aria-describedby": `band-${plan.id}` } : {})}
                onChange={(e) => change({ features: d.features.map((v, j) => (j === i ? e.target.value : v)) })}
                className={cn(inputClass, "mt-1")}
              />
            </label>
          ))}
          <LegacyBandNote id={`band-${plan.id}`} previous={saved.features[1]} next={d.features[1]} />
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-ink-900">Card checklist <span className="font-normal text-ink-600">(switch on: the plan includes it)</span></legend>
          <ul className="mt-1.5 space-y-2">
            {d.featureList.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <Switch
                  checked={f.included}
                  onCheckedChange={(included) => change({ featureList: d.featureList.map((row, j) => (j === i ? { ...row, included } : row)) }, true)}
                  aria-label={`${f.label || "Row"} included`}
                />
                <input
                  value={f.label}
                  aria-label={`Checklist row ${i + 1}`}
                  onChange={(e) => change({ featureList: d.featureList.map((row, j) => (j === i ? { ...row, label: e.target.value } : row)) })}
                  {...bad("featureList", f.label.trim().length > 120 || d.featureList.filter((r) => r.label.trim()).length > 12)}
                  className={cn(inputClass, "mt-0 min-w-0 flex-1")}
                />
                <button
                  type="button"
                  onClick={() => change({ featureList: d.featureList.filter((_, j) => j !== i) }, true)}
                  className={cn(buttonClass({ variant: "ghost", size: "sm" }), "h-10 shrink-0 px-1.5 text-ink-700 hover:text-danger")}
                  aria-label={`Remove checklist row ${i + 1}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => change({ featureList: [...d.featureList, { label: "", included: true }] })}
            className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-2")}
          >
            <Plus className="size-3.5" aria-hidden /> Add checklist row
          </button>
        </fieldset>

        <label className="flex min-h-8 items-center gap-2 text-sm text-ink-900 touch:min-h-11">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => onFeatured(e.target.checked)}
            className="size-5 accent-brand-700"
          />
          Mark as &ldquo;Most popular&rdquo;
        </label>

        <div className="space-y-3 border-t border-ink-200 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="nums text-xs text-ink-600">
              USD: {formatMoney(inrMinorToUsdMinor(toMinor(d.hourly)), "USD")}/hr ·{" "}
              {formatMoney(inrMinorToUsdMinor(toMinor(d.perHire)), "USD")} per hire
            </p>
            <SaveNowButton enabled={auto.state.sending === null && auto.status === "pending"} />
          </div>
          {issue && issue.message !== bandChange?.message ? (
            <p id={fid("error")} role="alert" className="text-sm text-danger">{issue.message}</p>
          ) : null}
          <AutosaveStatus auto={auto} live={d.active ? "Live on the site" : "Switched off: not shown on the site"} />
        </div>
      </form>
    </div>
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
      <label className="block text-sm font-medium text-ink-900">
        {label}
        <input id={ids[0]} {...bad(ids[0])} inputMode="decimal" value={now} onChange={(e) => onNow(clean(e.target.value))} className={inputClass} />
      </label>
      <label className="block text-sm font-medium text-ink-900">
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

/** Saves what is waiting right now instead of after the pause; also what Enter does in a form. */
function SaveNowButton({ enabled }: { enabled: boolean }) {
  return (
    // Primary only while something is waiting; otherwise a quiet disabled outline, so the page has one primary at a time.
    <button type="submit" disabled={!enabled} className={buttonClass({ variant: enabled ? "primary" : "outline", size: "sm" })}>
      <Save className="size-3.5" aria-hidden />
      Save now
    </button>
  );
}

function Warning({ children, id, danger }: { children: React.ReactNode; id?: string; danger?: boolean }) {
  return (
    <p
      id={id}
      role={danger ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm leading-relaxed",
        danger ? "border-danger text-danger" : "border-ink-300 text-ink-900",
      )}
    >
      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", !danger && "text-signal")} aria-hidden />
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
        {change.block ? " It is not saved until it can." : ""}
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
