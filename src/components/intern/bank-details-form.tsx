"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { csrfFetch } from "@/lib/client-fetch";

export type BankDetails = {
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
};

const input =
  "mt-1.5 h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const label = "block text-sm font-medium text-ink-800";

export function BankDetailsForm({
  initialBank,
}: {
  initialBank?: BankDetails;
}) {
  const [bankName, setBankName] = useState(initialBank?.bankName || "");
  const [accountHolderName, setAccountHolderName] = useState(initialBank?.accountHolderName || "");
  const [accountNumber, setAccountNumber] = useState(initialBank?.accountNumber || "");
  const [ifscCode, setIfscCode] = useState(initialBank?.ifscCode || "");
  const [upiId, setUpiId] = useState(initialBank?.upiId || "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

    try {
      const res = await csrfFetch("/api/intern/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank: {
            bankName,
            accountHolderName: accountHolderName.trim(),
            accountNumber,
            ifscCode: ifscCode.toUpperCase().trim(),
            upiId: upiId.trim(),
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save bank details");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save bank details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="bank-name" className={label}>
            Bank name
            <input
              id="bank-name"
              type="text"
              required
              placeholder="e.g. State Bank of India"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={input}
            />
          </label>

          <label htmlFor="bank-account-holder" className={label}>
            Account holder name
            <input
              id="bank-account-holder"
              type="text"
              required
              placeholder="As it appears on your passbook"
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              className={input}
              autoComplete="name"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="bank-account-number" className={label}>
            Account number
            <input
              id="bank-account-number"
              type="text"
              required
              inputMode="numeric"
              placeholder="Bank account number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className={`${input} font-mono tabular-nums`}
            />
          </label>

          <label htmlFor="bank-ifsc" className={label}>
            IFSC code
            <input
              id="bank-ifsc"
              type="text"
              required
              placeholder="e.g. SBIN0001234"
              value={ifscCode}
              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
              className={`${input} font-mono uppercase`}
            />
            <span className="mt-1 block text-xs font-normal text-text-subtle">
              11 characters, printed on your cheque book and passbook.
            </span>
          </label>
        </div>

        <label htmlFor="bank-upi" className={label}>
          UPI ID (optional)
          <input
            id="bank-upi"
            type="text"
            placeholder="e.g. username@okhdfcbank"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            className={input}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : saved ? (
              <Check className="size-4" aria-hidden />
            ) : null}
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
