"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BankFields, type BankValues } from "@/components/intern/bank-fields";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";

/** The TPO's bank account for withdrawals. The full number never comes back to the browser. */
export function BankForm({ bank, locked }: { bank: { holder: string; bankName: string; last4: string; ifsc: string } | null; locked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!bank);
  const [v, setV] = useState<BankValues>({
    accountHolderName: bank?.holder ?? "",
    bankName: bank?.bankName ?? "",
    accountNumber: "",
    accountNumberConfirm: "",
    ifscCode: bank?.ifsc ?? "",
    upiId: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (bank && !open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="font-medium">{bank.holder} · {bank.bankName}</p>
          <p className="nums text-text-subtle">•••• {bank.last4} · {bank.ifsc}</p>
          {locked ? <p role="status" className="mt-1 text-text-subtle">Locked while your withdrawal is waiting.</p> : null}
        </div>
        {locked ? null : (
          <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "outline", size: "sm" })}>Change</button>
        )}
      </div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch("/api/college/bank", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holder: v.accountHolderName, bankName: v.bankName, accountNumber: v.accountNumber, confirm: v.accountNumberConfirm, ifsc: v.ifscCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(data.error ?? "Could not save. Try again.");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <BankFields value={v} onChange={(p) => setV((x) => ({ ...x, ...p }))} accountLast4={bank?.last4} />
      {msg ? <p role="status" className="text-sm text-red-600">{msg}</p> : null}
      <button type="submit" disabled={busy} className={buttonClass({ size: "sm" })}>{busy ? "Saving…" : "Save bank details"}</button>
    </form>
  );
}
