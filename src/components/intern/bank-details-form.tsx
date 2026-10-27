"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { bankErrors } from "@/lib/onboarding";

import { BankFields, type BankErrorKeys, type BankValues } from "./bank-fields";

export type BankDetails = {
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
};

/**
 * Bank details from Settings. Same fields as the onboarding About step
 * (`BankFields`): the bank is picked from a list, everything is checked
 * before it is sent, and a field's error clears as soon as it is right.
 */
export function BankDetailsForm({ initialBank }: { initialBank?: BankDetails }) {
  const [bank, setBank] = useState<BankValues>({
    bankName: initialBank?.bankName ?? "",
    accountHolderName: initialBank?.accountHolderName ?? "",
    accountNumber: initialBank?.accountNumber ?? "",
    ifscCode: initialBank?.ifscCode ?? "",
    upiId: initialBank?.upiId ?? "",
  });
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const live = bankErrors(bank) as Partial<Record<BankErrorKeys, string>>;
  const errors = attempted ? live : {};

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setErrorMsg("");
    const first = Object.keys(live)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/intern/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank: {
            bankName: bank.bankName.trim(),
            accountHolderName: bank.accountHolderName.trim(),
            accountNumber: bank.accountNumber,
            ifscCode: bank.ifscCode.toUpperCase().trim(),
            upiId: bank.upiId.trim(),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't save your bank details. Try again.");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Couldn't save your bank details. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface className="p-5 sm:p-6">
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <BankFields value={bank} onChange={(patch) => setBank((b) => ({ ...b, ...patch }))} errors={errors} />
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-200/70 pt-5">
          <button type="submit" disabled={saving} className={buttonClass({ variant: "primary", size: "md" })}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : saved ? <Check className="size-4" aria-hidden /> : null}
            {saving ? "Saving…" : saved ? "Saved" : "Save bank details"}
          </button>
          {errorMsg ? (
            <span role="alert" className="text-sm text-danger">
              {errorMsg}
            </span>
          ) : saved ? (
            <span role="status" className="text-sm text-success">
              Bank details saved.
            </span>
          ) : null}
        </div>
      </form>
    </Surface>
  );
}
