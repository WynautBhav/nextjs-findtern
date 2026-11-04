"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";

import { sendInline } from "@/components/admin/inline-control";
import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
] as const;

type Status = (typeof OPTIONS)[number]["value"];

const fieldClass =
  "h-9 w-full rounded-apple-sm border border-ink-200 bg-surface px-2.5 text-base font-normal text-ink-900 placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 max-lg:h-11 sm:text-sm";

/**
 * Row-level payout editor for the payout and transaction tables.
 *
 * Bank transfers happen outside the app, so the ledger needs a hand: pick
 * paid or failed, type the UTR / bank reference, optionally leave a note for
 * the team. Paid requires the reference (the API refuses it otherwise, and
 * the refusal is shown as is). Only a pending payout can be settled
 * (ADP-31); a settled one is history, so nothing renders for it when
 * `status` is passed.
 *
 * Both outcomes are final for the ledger (a paid payout is never reopened and
 * a failed one is re-queued by hand), so saving asks first, with Cancel
 * focused.
 *
 * The note is an ops note (`raw.opsNote`); the payout's `notes` column keeps
 * its legacy meaning, the role name in the stipend email (DB-17).
 */
export function PayoutEditor({
  payoutId,
  initialReference,
  initialNote,
  status,
  onSaved,
}: {
  payoutId: string;
  initialReference: string | null;
  initialNote?: string | null;
  /** Current status; when given and not pending, nothing is rendered. */
  status?: string;
  /** Called once after the ledger accepted the change, before the page refreshes (the dashboard peek uses it to clear the row). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Status>("paid");
  const [reference, setReference] = useState(initialReference ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) formRef.current?.querySelector<HTMLElement>("[role=radio]")?.focus();
  }, [open]);

  if (status !== undefined && status !== "pending") return null;

  function close() {
    setOpen(false);
    setError(null);
    triggerRef.current?.focus();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ref = reference.trim();
    // Said here too, so a missing reference is named before a request goes out (QA-103).
    if (choice === "paid" && !ref) {
      setError("Add the bank reference to mark it paid.");
      return;
    }
    const paid = choice === "paid";
    const ok = await ask({
      title: paid ? "Mark this payout as paid?" : "Mark this payout as failed?",
      body: paid
        ? `Records the transfer as sent (reference ${ref}) and emails the candidate. A paid payout cannot be reopened.`
        : "Records that the transfer did not go through. The payout leaves the pending queue.",
      confirmLabel: paid ? "Yes, mark paid" : "Yes, mark failed",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { status: choice, referenceId: ref || null };
    if (note.trim() !== (initialNote ?? "").trim()) body.opsNote = note.trim() || null;
    const result = await sendInline({ url: `/api/admin/payouts/${encodeURIComponent(payoutId)}`, method: "PATCH" }, body);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved?.();
    setOpen(false);
    triggerRef.current?.focus();
    router.refresh();
  }

  return (
    <div className="min-w-0">
      {dialog}
      {!open ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setChoice("paid");
            setReference(initialReference ?? "");
            setNote(initialNote ?? "");
            setOpen(true);
          }}
          className="group inline-flex min-h-9 items-center gap-2 rounded-apple-sm px-1.5 text-left text-sm text-ink-800 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-brand-600 max-lg:min-h-11"
        >
          <span className="min-w-0">
            <span className="font-medium text-brand-800">Mark paid or failed</span>
          </span>
          <span className="sr-only"> (edit payout status)</span>
          <Pencil className="size-3.5 shrink-0 text-text-subtle group-hover:text-brand-700" aria-hidden />
        </button>
      ) : (
        <form
          ref={formRef}
          onSubmit={save}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !saving) {
              e.stopPropagation();
              close();
            }
          }}
          aria-label="Edit payout status"
          aria-describedby={error ? errorId : undefined}
          className="flex min-w-56 max-w-full flex-col gap-2 rounded-apple-md border border-brand-200 bg-card p-2.5 shadow-sm"
        >
          <div className="grid gap-2">
            <div className="grid gap-1 text-xs font-medium text-ink-700">
              <span id={`${errorId}-status`}>New status</span>
              <div role="radiogroup" aria-labelledby={`${errorId}-status`} className="grid auto-cols-fr grid-flow-col gap-1.5">
                {OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={cn(
                      "flex h-9 cursor-pointer items-center justify-center rounded-apple-sm border px-2 text-sm font-semibold touch:h-11 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                      choice === o.value ? "border-brand-600 bg-brand-50 text-brand-800" : "border-ink-200 bg-card text-ink-600 hover:bg-ink-50",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${errorId}-status`}
                      value={o.value}
                      checked={choice === o.value}
                      onChange={() => setChoice(o.value)}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="grid gap-1 text-xs font-medium text-ink-700">
              Bank reference (required when paid)
              <input
                value={reference}
                onChange={(e) => { setReference(e.target.value); setError(null); }}
                placeholder="UTR / NEFT reference"
                maxLength={64}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-ink-700">
              Note for the team (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={fieldClass} />
            </label>
          </div>
          {error ? (
            <span id={errorId} role="alert" className="block max-w-56 whitespace-normal text-xs font-medium text-danger">
              {error}
            </span>
          ) : null}
          <div className="flex items-center gap-1.5">
            <button type="submit" disabled={saving} className={buttonClass({ variant: "primary", size: "sm" })}>
              {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              Done
            </button>
            <button type="button" onClick={close} disabled={saving} className={buttonClass({ variant: "ghost", size: "sm" })}>
              <X className="size-3.5" aria-hidden />
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
