"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Field } from "@/components/app/form-field";
import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { csrfFetch } from "@/lib/client-fetch";
import type { PromoCode } from "@/lib/db/schema";
import { promoCodeProblem } from "@/lib/admin/promo-edit-rules";
import { isoToIstInput, istInputToIso } from "@/lib/admin/promo-form-time";
import { COLLEGE_CODE_LOCKED, type PromoAppliesTo } from "@/lib/promo-rules";
import { cn } from "@/lib/utils";

/**
 * Create / edit a promo code. Same fields, same payload and same checks as before; each field now has a real label,
 * a hint and its own error, and the first field with an error takes focus.
 */

const CONTROL = "h-11 md:h-10";
const SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:h-10 md:text-sm dark:bg-input/30";

type Errors = Partial<Record<"code" | "value" | "until", string>>;

export function PromoForm({
  onOpenChange,
  editing,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void;
  editing: PromoCode | null;
  onSaved: (promo: PromoCode, mode: "created" | "updated") => void;
}) {
  // The form is mounted only while open (see below), so these start from the code being edited, or blank.
  const [code, setCode] = useState(editing?.code ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(editing?.discountType === "fixed" ? "fixed" : "percentage");
  const [discountValue, setDiscountValue] = useState<number | string>(editing ? (editing.discountType === "fixed" ? editing.discountValue / 100 : editing.discountValue) : 10);
  const [maxUsages, setMaxUsages] = useState<number | string>(editing?.maxUsages ?? "");
  const [minOrder, setMinOrder] = useState<number | string>(editing?.minOrderAmountMinor ? editing.minOrderAmountMinor / 100 : "");
  // The date fields are IST, whatever zone the admin's browser is in.
  const [validFrom, setValidFrom] = useState(isoToIstInput(editing?.validFrom));
  const [validUntil, setValidUntil] = useState(isoToIstInput(editing?.validUntil));
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [appliesTo, setAppliesTo] = useState<PromoAppliesTo>(
    editing ? (editing.appliesTo === "intern" || editing.appliesTo === "employer" || editing.appliesTo === "subscription" ? editing.appliesTo : "both") : "intern",
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  // A college code's discount, audience and cap are changed on the college screen only.
  const collegeLocked = Boolean(editing?.collegeId);

  function fail(next: Errors, id: string) {
    setErrors(next);
    setFormError("");
    // Wait a frame so aria-invalid is on the control before it takes focus.
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    setErrors({});
    const form = e.currentTarget;
    const id = (name: string) => form.querySelector<HTMLElement>(`[name="${name}"]`)?.id ?? "";

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) return fail({ code: "Enter a code, for example WELCOME20." }, id("code"));
    const codeProblem = promoCodeProblem(trimmedCode);
    if (codeProblem) return fail({ code: codeProblem }, id("code"));
    const valNum = Number(discountValue);
    // Fixed amounts are typed in rupees and stored in paise.
    const stored = discountType === "fixed" ? Math.round(valNum * 100) : valNum;
    if (Number.isNaN(valNum) || valNum <= 0) return fail({ value: "Enter a discount greater than 0." }, id("value"));
    if (discountType === "percentage" && valNum > 100) return fail({ value: "A percentage discount can't be more than 100." }, id("value"));
    if (discountType === "percentage" && valNum === 100 && appliesTo !== "intern") {
      return fail(
        {
          value:
            appliesTo === "subscription"
              ? "A subscription code can't be 100%. To give a subscription away, create a full-waiver code for the subscription."
              : "Only an intern code can be 100%. Employer codes can't cover the whole stipend.",
        },
        id("value"),
      );
    }
    if (validFrom && validUntil && (istInputToIso(validUntil) ?? "") < (istInputToIso(validFrom) ?? "")) {
      return fail({ until: "The end date must be on or after the start date." }, id("until"));
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        code: trimmedCode,
        // null clears a field that was set before.
        description: description.trim() || null,
        discountType,
        discountValue: stored,
        maxUsages: maxUsages !== "" ? Number(maxUsages) : null,
        minOrderAmountMinor: minOrder !== "" ? Math.round(Number(minOrder) * 100) : null,
        validFrom: istInputToIso(validFrom),
        validUntil: istInputToIso(validUntil),
        isActive,
        appliesTo,
      };
      if (editing) {
        const res = await csrfFetch(`/api/admin/promo-codes/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "The code could not be saved. Nothing was changed.");
        }
        onSaved(
          {
            ...editing,
            code: trimmedCode,
            description: description.trim() || null,
            discountType,
            discountValue: stored,
            maxUsages: maxUsages !== "" ? Number(maxUsages) : null,
            minOrderAmountMinor: minOrder !== "" ? Math.round(Number(minOrder) * 100) : null,
            validFrom: istInputToIso(validFrom) ? new Date(istInputToIso(validFrom)!) : null,
            validUntil: istInputToIso(validUntil) ? new Date(istInputToIso(validUntil)!) : null,
            isActive,
            appliesTo,
            updatedAt: new Date(),
          },
          "updated",
        );
      } else {
        const res = await csrfFetch("/api/admin/promo-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "The code could not be created. Nothing was saved.");
        }
        const data = await res.json();
        if (data.promo) onSaved(data.promo as PromoCode, "created");
      }
      onOpenChange(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Nothing was saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-display text-xl font-semibold text-ink-900">{editing ? `Edit ${editing.code}` : "New promo code"}</DialogTitle>
        <DialogDescription className="text-sm text-ink-600">
          {editing ? "Change the terms, the limit or when it ends. Codes already used keep the discount they got." : "A code interns or employers type at checkout."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} noValidate className="space-y-4">
        {collegeLocked ? (
          <p role="note" className="border-y border-ink-200 py-2 text-sm text-ink-700">
            {COLLEGE_CODE_LOCKED}
          </p>
        ) : null}
        {formError ? (
          <p role="alert" className="border-y border-danger/40 py-2 text-sm font-medium text-danger">
            {formError}
          </p>
        ) : null}

        <Field label="Code" hint="3 to 32 letters, numbers, - or _. Saved in capitals." error={errors.code} required>
          {(p) => <Input {...p} name="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME20" autoComplete="off" className={cn(CONTROL, "uppercase tracking-[0.06em]")} />}
        </Field>

        <Field label="Description" optional hint="Only admins see this.">
          {(p) => <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Early adopter discount" className={CONTROL} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type of discount">
            {(p) => (
              <select {...p} value={discountType} disabled={collegeLocked} onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")} className={SELECT}>
                <option value="percentage">Percent off</option>
                <option value="fixed">Rupees off</option>
              </select>
            )}
          </Field>
          <Field label={discountType === "percentage" ? "Percent off" : "Rupees off"} hint={discountType === "percentage" ? "1 to 100" : "Taken off the payment, in ₹"} error={errors.value} required>
            {(p) => (
              <Input {...p} name="value" type="number" inputMode="decimal" min="1" max={discountType === "percentage" ? "100" : undefined} value={discountValue} disabled={collegeLocked} onChange={(e) => setDiscountValue(e.target.value)} className={cn(CONTROL, "nums")} />
            )}
          </Field>
        </div>

        <Field label="Who can use it" hint={appliesTo === "subscription" ? "Takes money off the Findtern Pro subscription only. It does not work on hires or intern activation." : "Hiring and activation codes never apply to the Findtern Pro subscription."}>
          {(p) => (
            <select {...p} value={appliesTo} disabled={collegeLocked} onChange={(e) => setAppliesTo(e.target.value as PromoAppliesTo)} className={SELECT}>
              <option value="intern">Interns (activation fee)</option>
              <option value="employer">Employers (hiring checkout)</option>
              <option value="both">Interns and employers</option>
              <option value="subscription">Employer subscription (Findtern Pro)</option>
            </select>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max uses" optional hint="Leave blank for no limit.">
            {(p) => <Input {...p} type="number" inputMode="numeric" min="1" value={maxUsages} disabled={collegeLocked} onChange={(e) => setMaxUsages(e.target.value)} placeholder="50" className={cn(CONTROL, "nums")} />}
          </Field>
          <Field label="Minimum order, ₹" optional hint="The smallest order it works on.">
            {(p) => <Input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="2499" className={cn(CONTROL, "nums")} />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts, IST" optional hint="Blank means from now.">
            {(p) => <Input {...p} type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={CONTROL} />}
          </Field>
          <Field label="Ends, IST" optional hint="Blank means it never expires." error={errors.until}>
            {(p) => <Input {...p} name="until" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={CONTROL} />}
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4 border-y border-ink-200 py-3">
          <div>
            <p id="promo-active-label" className="text-sm font-medium text-ink-900">
              {isActive ? "Active" : "Paused"}
            </p>
            <p className="text-sm text-ink-600">{isActive ? "It can be used at checkout." : "It is saved but cannot be used until you resume it."}</p>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} aria-labelledby="promo-active-label" />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className={buttonClass({ variant: "light", size: "md" })}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={buttonClass({ variant: "primary", size: "md" })}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {editing ? "Save changes" : "Create code"}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** The dialog shell, so the form below it remounts (and so re-reads the code being edited) each time it opens. */
export function PromoFormDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; editing: PromoCode | null; onSaved: (promo: PromoCode, mode: "created" | "updated") => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <PromoForm key={props.editing?.id ?? "new"} onOpenChange={props.onOpenChange} editing={props.editing} onSaved={props.onSaved} /> : null}
    </Dialog>
  );
}
