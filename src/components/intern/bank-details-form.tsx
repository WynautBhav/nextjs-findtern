"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { DetailRow, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { bankErrors } from "@/lib/onboarding";

import { BankFields, type BankErrorKeys, type BankValues } from "./bank-fields";

export type BankDetails = {
  bankName?: string;
  accountHolderName?: string;
  /** Only the last 4 digits reach the browser; the full number stays on the server. */
  accountLast4?: string;
  ifscCode?: string;
  upiId?: string;
};

/**
 * Bank details from Settings. Same fields as the onboarding About step
 * (`BankFields`): the bank is picked from a list, everything is checked
 * before it is sent, and a field's error clears as soon as it is right.
 *
 * Saved details show as a read-only summary with the account number masked,
 * and Edit opens the form (QA-011). The stored number is never sent here: a
 * new one is typed in full (twice), and a blank one keeps what is on file.
 */
type Stored = Omit<BankValues, "accountNumber" | "accountNumberConfirm"> & { accountLast4: string };

function fromSaved(b?: BankDetails): Stored {
  return {
    bankName: b?.bankName ?? "",
    accountHolderName: b?.accountHolderName ?? "",
    accountLast4: b?.accountLast4 ?? "",
    ifscCode: b?.ifscCode ?? "",
    upiId: b?.upiId ?? "",
  };
}

const toForm = (b: Stored): BankValues => ({
  bankName: b.bankName,
  accountHolderName: b.accountHolderName,
  accountNumber: "",
  accountNumberConfirm: "",
  ifscCode: b.ifscCode,
  upiId: b.upiId,
});

const onFile = (b: Stored) => Boolean(b.accountLast4 || b.upiId.trim());

/** Field ids in the order they appear, so a failed submit focuses the first one on screen. */
const ORDER: BankErrorKeys[] = ["bankName", "bankAccountHolderName", "bankAccountNumber", "bankAccountNumberConfirm", "bankIfscCode", "bankUpiId"];

export function BankDetailsForm({ initialBank }: { initialBank?: BankDetails }) {
  const [stored, setStored] = useState<Stored>(() => fromSaved(initialBank));
  const [bank, setBank] = useState<BankValues>(() => toForm(stored));
  const [editing, setEditing] = useState(() => !onFile(fromSaved(initialBank)));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  // Focus goes back to the button that opened the form once it closes.
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(t);
  }, [saved]);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  const live = bankErrors(bank) as Partial<Record<BankErrorKeys, string>>;
  // A blank number keeps the account on file.
  if (!bank.accountNumber && stored.accountLast4) delete live.bankAccountNumber;
  if (bank.accountNumber && bank.accountNumberConfirm !== bank.accountNumber) {
    live.bankAccountNumberConfirm = bank.accountNumberConfirm ? "The two account numbers don't match." : "Type the account number again.";
  }
  const errors = attempted ? live : {};

  function close() {
    setEditing(false);
    returnFocus.current = true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setErrorMsg("");
    const first = ORDER.find((k) => live[k]);
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
            // "" keeps the stored number (the route fills it in).
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
      setStored({
        bankName: bank.bankName.trim(),
        accountHolderName: bank.accountHolderName.trim(),
        accountLast4: bank.accountNumber ? bank.accountNumber.slice(-4) : stored.accountLast4,
        ifscCode: bank.ifscCode,
        upiId: bank.upiId,
      });
      setSaved(true);
      close();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Couldn't save your bank details. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const last4 = stored.accountLast4;
    return (
      <Surface className="flex flex-col gap-5 p-5 sm:flex-row sm:flex-wrap sm:items-end sm:p-6">
        {/* The account as the thing it is: where the stipend lands. */}
        <div className="flex flex-col justify-between gap-6 rounded-apple-lg bg-brand-800 p-5 text-white sm:aspect-[2.2/1] sm:w-full sm:max-w-md sm:p-6">
          <div aria-hidden className="flex items-start justify-between gap-4">
            <p className="text-base font-medium">{stored.bankName || "Bank not added"}</p>
            <p className="nums text-sm text-white/70">{stored.ifscCode || "-"}</p>
          </div>
          <div aria-hidden>
            <p className="nums text-2xl font-medium tracking-[0.08em]">{last4 ? `•••• ${last4}` : "-"}</p>
            <p className="mt-2 text-sm text-white/80">{stored.accountHolderName || "-"}</p>
          </div>
          <dl className="sr-only">
            <DetailRow label="Account holder" value={stored.accountHolderName || "-"} />
            <DetailRow label="Bank" value={stored.bankName || "-"} />
            <DetailRow label="Account number" value={last4 ? `ending ${last4}` : "-"} />
            <DetailRow label="IFSC" value={stored.ifscCode || "-"} />
          </dl>
        </div>
        {stored.upiId ? (
          <dl className="min-w-0 sm:flex-1">
            <DetailRow label="UPI ID" value={stored.upiId} />
          </dl>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            ref={editButton}
            type="button"
            onClick={() => {
              setBank(toForm(stored));
              setAttempted(false);
              setErrorMsg("");
              setSaved(false);
              setEditing(true);
              window.requestAnimationFrame(() => document.getElementById("bankAccountHolderName")?.focus());
            }}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            Edit bank details
          </button>
          {/* Mounted empty so the message is announced when it fills. */}
          <span role="status" className="text-sm text-success">
            {saved ? "Bank details saved." : ""}
          </span>
        </div>
      </Surface>
    );
  }

  return (
    <Surface className="p-5 sm:p-6">
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <BankFields
          value={bank}
          accountLast4={stored.accountLast4}
          onChange={(patch) => setBank((b) => ({ ...b, ...patch }))}
          errors={errors}
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-200/70 pt-5">
          <button type="submit" disabled={saving} className={buttonClass({ variant: "primary", size: "md" })}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save bank details"}
          </button>
          {onFile(stored) ? (
            <button type="button" onClick={close} disabled={saving} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Cancel
            </button>
          ) : null}
          {errorMsg ? (
            <span role="alert" className="text-sm text-danger">
              {errorMsg}
            </span>
          ) : null}
        </div>
      </form>
    </Surface>
  );
}
