"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Save, Building } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

export type BankDetails = {
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
};

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
    <div className="rounded-[20px] border border-ink-100 bg-white p-6 shadow-2xs">
      <div className="flex items-center gap-2 border-b border-ink-100 pb-4 mb-6">
        <Building className="size-5 text-brand-700" />
        <h3 className="font-bold text-base text-ink-900">Bank Details</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {errorMsg}
          </div>
        ) : null}

        {saved ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs font-semibold text-brand-800">
            Bank details saved.
          </div>
        ) : null}

        <div>
          <label htmlFor="bank-name" className="block text-2xs font-semibold uppercase tracking-wider text-text-subtle mb-1.5">
            Bank Name
          </label>
          <input
            id="bank-name"
            type="text"
            required
            placeholder="e.g. State Bank of India, HDFC Bank"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label htmlFor="bank-account-holder" className="block text-2xs font-semibold uppercase tracking-wider text-text-subtle mb-1.5">
            Account Holder Name
          </label>
          <input
            id="bank-account-holder"
            type="text"
            required
            placeholder="Name as it appears on your passbook / checkbook"
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label htmlFor="bank-account-number" className="block text-2xs font-semibold uppercase tracking-wider text-text-subtle mb-1.5">
            Account Number
          </label>
          <input
            id="bank-account-number"
            type="text"
            required
            placeholder="Enter bank account number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-xs font-mono text-ink-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label htmlFor="bank-ifsc" className="block text-2xs font-semibold uppercase tracking-wider text-text-subtle mb-1.5">
            IFSC Code
          </label>
          <input
            id="bank-ifsc"
            type="text"
            required
            placeholder="11-character alphanumeric code (e.g. SBIN0001234)"
            value={ifscCode}
            onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-xs font-mono text-ink-900 uppercase focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label htmlFor="bank-upi" className="block text-2xs font-semibold uppercase tracking-wider text-text-subtle mb-1.5">
            UPI ID (optional)
          </label>
          <input
            id="bank-upi"
            type="text"
            placeholder="e.g. username@okhdfcbank"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-ink-100">
          <Link
            href="/intern/dashboard"
            className="apple-spring apple-pressable inline-flex min-h-10 items-center justify-center rounded-[10px] border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-700 hover:bg-ink-50"
          >
            Back
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="apple-spring apple-pressable inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] bg-brand-700 px-5 text-xs font-semibold text-white shadow-2xs hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : saved ? (
              <Check className="size-3.5" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span>{saving ? "Saving..." : saved ? "Saved" : "Save Bank Details"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
