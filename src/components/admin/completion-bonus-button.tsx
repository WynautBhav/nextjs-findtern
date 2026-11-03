"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award, Loader2 } from "lucide-react";

import { sendInline } from "@/components/admin/inline-control";
import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";

/**
 * Staff mark a hired internship as successful: +1 Findtern Score for the
 * intern (max 10), once per hire. After the grant the button turns into a
 * plain "Bonus granted" note; the server refuses a second grant either way.
 */
export function CompletionBonusButton({
  internId,
  proposalId,
  grantedOn,
}: {
  internId: string;
  proposalId: string;
  /** Pre-formatted date when the bonus was already granted, else null. */
  grantedOn: string | null;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (grantedOn) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-600">
        <Award className="size-4" aria-hidden />
        Bonus granted {grantedOn}
      </span>
    );
  }

  async function grant() {
    const ok = await ask({
      title: "Grant the completion bonus?",
      body: "This marks the internship as successful and adds 1 to the intern's Findtern Score (maximum 10). It can be done once per hire and cannot be undone.",
      confirmLabel: "Grant +1 score",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await sendInline({ url: `/api/admin/interns/${encodeURIComponent(internId)}/completion-bonus`, method: "POST" }, { proposalId });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={grant} disabled={busy} className={buttonClass({ variant: "outline", size: "sm" })}>
        {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Award className="size-4" aria-hidden />}
        Grant completion bonus
      </button>
      {error ? (
        <span role="alert" className="max-w-56 text-right text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
      {dialog}
    </span>
  );
}
