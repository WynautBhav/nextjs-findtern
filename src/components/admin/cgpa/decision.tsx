"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { decisionProblem } from "@/lib/cgpa-verification-flow";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

const fieldClass =
  "mt-1.5 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base text-ink-900 outline-none placeholder:text-text-subtle focus:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm";

type Target = { internId: string; name: string; semester: number | null; claimedScore: string; scoreType: "cgpa" | "percentage" | "" };

async function send(internId: string, payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await csrfFetch(`/api/admin/cgpa-verifications/${encodeURIComponent(internId)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Could not save the decision." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Nothing was changed. Try again." };
  }
}

/**
 * The two decisions on a pending check. "Verify" asks for one confirmation in a dialog (it tells the intern and the
 * employers, so it is not one stray click). "Mark incorrect" needs the corrected score and a note. Errors stay in the
 * dialog, announced; success closes it and refreshes the queue.
 */
export function CgpaDecision({ target }: { target: Target }) {
  const router = useRouter();
  const [open, setOpen] = useState<"verify" | "incorrect" | null>(null);
  const [corrected, setCorrected] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const id = useId();
  const unit = target.scoreType === "percentage" ? "%" : " / 10";
  const problem = decisionProblem({ decision: "incorrect", correctedScore: corrected, note }, target.claimedScore, target.scoreType);
  const scoreError = tried && problem && !/note/i.test(problem) ? problem : null;
  const noteError = tried && problem && /note/i.test(problem) ? problem : null;

  function close() {
    setOpen(null);
    setError(null);
    setTried(false);
    setCorrected("");
    setNote("");
  }

  async function submit(decision: "verified" | "incorrect") {
    setTried(true);
    setError(null);
    if (decision === "incorrect" && problem) return;
    setBusy(true);
    const res = await send(target.internId, decision === "verified" ? { decision } : { decision, correctedScore: corrected.trim(), note: note.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    close();
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 max-sm:flex-col">
        <button type="button" onClick={() => setOpen("verify")} className={cn(buttonClass({ variant: "primary", size: "sm" }), "min-h-11 rounded-full px-5")}>
          <CheckCircle2 className="size-4" aria-hidden />
          Verify CGPA correct
        </button>
        <button type="button" onClick={() => setOpen("incorrect")} className={cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11 rounded-full border-danger/40 px-5 text-danger hover:bg-danger-soft")}>
          <TriangleAlert className="size-4" aria-hidden />
          Mark incorrect
        </button>
      </div>

      <Dialog open={open === "verify"} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify {target.name}&apos;s CGPA?</DialogTitle>
            <DialogDescription>
              Confirm the proofs show {target.claimedScore}
              {unit}
              {target.semester ? ` for semester ${target.semester}` : ""}. {target.name.split(" ")[0]} and the companies waiting on this offer are told it is verified.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="rounded-apple-sm bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 max-sm:flex-col-reverse">
            <button type="button" onClick={close} className={cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11 rounded-full px-5")}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void submit("verified")} className={cn(buttonClass({ variant: "primary", size: "sm" }), "min-h-11 rounded-full px-5")}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? "Saving…" : "Yes, it is correct"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "incorrect"} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit("incorrect");
            }}
            noValidate
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Mark {target.name}&apos;s CGPA incorrect</DialogTitle>
              <DialogDescription>
                They entered {target.claimedScore}
                {unit}. The corrected score replaces it on their profile, and each company with an unpaid accepted offer has to confirm it before paying.
              </DialogDescription>
            </DialogHeader>
            <div>
              <label htmlFor={`${id}-score`} className="text-sm font-medium text-foreground">
                Corrected score{target.scoreType === "percentage" ? " (%)" : " (out of 10)"}
              </label>
              <input
                id={`${id}-score`}
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={corrected}
                onChange={(e) => setCorrected(e.target.value)}
                aria-invalid={scoreError ? true : undefined}
                aria-describedby={scoreError ? `${id}-score-err` : undefined}
                className={cn(fieldClass, "min-h-11", scoreError && "border-danger")}
              />
              {scoreError ? (
                <p id={`${id}-score-err`} className="mt-1.5 text-xs font-medium text-danger">
                  {scoreError}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor={`${id}-note`} className="text-sm font-medium text-foreground">
                What the proof shows
              </label>
              <textarea
                id={`${id}-note`}
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-invalid={noteError ? true : undefined}
                aria-describedby={noteError ? `${id}-note-err` : undefined}
                placeholder="For example: semester 4 marksheet shows 7.9 CGPA."
                className={cn(fieldClass, "py-2", noteError && "border-danger")}
              />
              {noteError ? (
                <p id={`${id}-note-err`} className="mt-1.5 text-xs font-medium text-danger">
                  {noteError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-text-subtle">Saved with the decision and shown to the candidate.</p>
              )}
            </div>
            {error ? (
              <p role="alert" className="rounded-apple-sm bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
            <DialogFooter className="gap-2 max-sm:flex-col-reverse">
              <button type="button" onClick={close} className={cn(buttonClass({ variant: "outline", size: "sm" }), "min-h-11 rounded-full px-5")}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={cn(buttonClass({ variant: "primary", size: "sm" }), "min-h-11 rounded-full px-5")}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? "Saving…" : "Save correction"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
