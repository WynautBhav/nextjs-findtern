"use client";

import { useState } from "react";

import { BANKS } from "@/lib/data/banks";

import { controlClass, Field, FieldNote, Grid, Label, Select } from "./onboarding/fields";

export type BankValues = {
  accountHolderName: string;
  bankName: string;
  /** A new number only; blank keeps the one on file when `accountLast4` is set. */
  accountNumber: string;
  accountNumberConfirm: string;
  ifscCode: string;
  upiId: string;
};

/** Error keys, as `bankErrors` in lib/onboarding returns them. */
export type BankErrorKeys = "bankAccountHolderName" | "bankName" | "bankAccountNumber" | "bankAccountNumberConfirm" | "bankIfscCode" | "bankUpiId";

const OTHER = "__other";

/**
 * Bank account fields, shared by the About step of onboarding (bug sheet 7,
 * NC r25) and Settings. The bank name is a dropdown (NC r27); a bank that is
 * not on the list is typed in, and is stored exactly as typed in the legacy
 * `extra.bankDetails.bankName`.
 */
export function BankFields({
  value,
  onChange,
  errors = {},
  accountLast4 = "",
}: {
  value: BankValues;
  /** Last 4 digits of the stored account; the full number is never sent to the browser. */
  accountLast4?: string;
  onChange: (patch: Partial<BankValues>) => void;
  errors?: Partial<Record<BankErrorKeys, string>>;
}) {
  const known = BANKS.find((b) => b.toLowerCase() === value.bankName.trim().toLowerCase());
  const [typing, setTyping] = useState(Boolean(value.bankName.trim() && !known));
  const manual = typing || Boolean(value.bankName.trim() && !known);

  return (
    <Grid>
      <div className="min-w-0">
        <Label htmlFor={manual ? "bankNameSelect" : "bankName"}>Bank</Label>
        <Select
          id={manual ? "bankNameSelect" : "bankName"}
          value={manual ? OTHER : (known ?? "")}
          placeholder="Choose your bank"
          onChange={(next) => {
            if (next === OTHER) {
              setTyping(true);
              onChange({ bankName: "" });
              window.requestAnimationFrame(() => document.getElementById("bankName")?.focus());
              return;
            }
            setTyping(false);
            onChange({ bankName: next });
          }}
          options={[...BANKS.map((b) => ({ value: b, label: b })), { value: OTHER, label: "Other - type the name" }]}
          error={manual ? undefined : errors.bankName}
          className="mt-2"
        />
        {manual ? (
          <input
            id="bankName"
            name="bankName"
            value={value.bankName}
            placeholder="Your bank's full name"
            onChange={(e) => onChange({ bankName: e.target.value })}
            aria-label="Bank name"
            aria-invalid={errors.bankName ? true : undefined}
            aria-describedby={errors.bankName ? "bankName-error" : undefined}
            className={controlClass(errors.bankName, "mt-2")}
          />
        ) : null}
        <FieldNote id="bankName" error={errors.bankName} />
      </div>
      <Field
        id="bankAccountHolderName"
        label="Account holder name"
        value={value.accountHolderName}
        onChange={(v) => onChange({ accountHolderName: v })}
        placeholder="As printed on your passbook"
        autoComplete="name"
        error={errors.bankAccountHolderName}
      />
      <Field
        id="bankAccountNumber"
        label="Account number"
        value={value.accountNumber}
        onChange={(v) => onChange({ accountNumber: v.replace(/\D/g, "").slice(0, 18) })}
        inputMode="numeric"
        placeholder={accountLast4 ? `•••• ${accountLast4}` : "9 to 18 digits"}
        autoComplete="off"
        inputClassName="nums"
        error={errors.bankAccountNumber}
        hint={accountLast4 ? `Leave blank to keep the account ending ${accountLast4}.` : undefined}
      />
      <Field
        id="bankAccountNumberConfirm"
        label="Confirm account number"
        value={value.accountNumberConfirm}
        onChange={(v) => onChange({ accountNumberConfirm: v.replace(/\D/g, "").slice(0, 18) })}
        inputMode="numeric"
        autoComplete="off"
        inputClassName="nums"
        disabled={!value.accountNumber}
        error={errors.bankAccountNumberConfirm}
        hint={value.accountNumber ? "Type the account number again." : "Needed when you enter a new number."}
      />
      <Field
        id="bankIfscCode"
        label="IFSC code"
        value={value.ifscCode}
        onChange={(v) => onChange({ ifscCode: v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })}
        placeholder="SBIN0001234"
        autoComplete="off"
        inputClassName="nums uppercase"
        error={errors.bankIfscCode}
        hint="11 characters, printed on your cheque book."
      />
      <Field
        id="bankUpiId"
        label="UPI ID"
        optional
        value={value.upiId}
        onChange={(v) => onChange({ upiId: v.trim() })}
        placeholder="name@okhdfcbank"
        autoComplete="off"
        error={errors.bankUpiId}
      />
    </Grid>
  );
}
