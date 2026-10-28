"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { DetailRow, Surface } from "@/components/app/primitives";
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
 *
 * Saved details show as a read-only summary with the account number masked,
 * and Edit opens the form (QA-011): an open form looked like nothing was on
 * file, and it showed the full account number in an editable field.
 */
function fromSaved(b?: BankDetails): BankValues {
  return {
    bankName: b?.bankName ?? "",
    accountHolderName: b?.accountHolderName ?? "",
    accountNumber: b?.accountNumber ?? "",
    ifscCode: b?.ifscCode ?? "",
    upiId: b?.upiId ?? "",
  };
}

const onFile = (b: BankValues) => Boolean(b.accountNumber.trim() || b.upiId.trim());

export function BankDetailsForm({ initialBank }: { initialBank?: BankDetails }) {
  const [stored, setStored] = useState<BankValues>(() => fromSaved(initialBank));
  const [bank, setBank] = useState<BankValues>(stored);
  const [editing, setEditing] = useState(() => !onFile(fromSaved(initialBank)));
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
      setStored(bank);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Couldn't save your bank details. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const last4 = stored.accountNumber.replace(/\s/g, "").slice(-4);
    return (
      <Surface className="p-5 sm:p-6">
        <dl className="divide-y divide-ink-100">
          <DetailRow label="Account holder" value={stored.accountHolderName || "-"} />
          <DetailRow label="Bank" value={stored.bankName || "-"} />
          <DetailRow label="Account number" value={last4 ? `•••• ${last4}` : "-"} mono />
          <DetailRow label="IFSC" value={stored.ifscCode || "-"} mono />
          {stored.upiId ? <DetailRow label="UPI ID" value={stored.upiId} /> : null}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-200/70 pt-5">
          <button
            type="button"
            onClick={() => {
              setBank(stored);
              setAttempted(false);
              setEditing(true);
              window.requestAnimationFrame(() => document.getElementById("bankAccountHolderName")?.focus());
            }}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            Edit bank details
          </button>
          {saved ? (
            <span role="status" className="text-sm text-success">
              Bank details saved.
            </span>
          ) : null}
        </div>
      </Surface>
    );
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
          {onFile(stored) ? (
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Cancel
            </button>
          ) : null}
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
