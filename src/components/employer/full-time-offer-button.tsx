"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness } from "lucide-react";

import { FileUpload } from "@/components/app/file-upload";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { TIMEZONES } from "@/lib/timezones";

const input =
  "mt-1.5 h-10 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/** Offer a hired intern a full-time role (legacy "Full-time offer"). */
export function FullTimeOfferButton({
  employerId,
  proposalId,
  candidate,
  fteStatus: initialFte,
}: {
  employerId: string;
  proposalId: string;
  candidate: string;
  fteStatus: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fte, setFte] = useState(initialFte);
  const [v, setV] = useState({
    jobTitle: "",
    jobMode: "remote",
    jobLocationCity: "",
    jobLocationState: "",
    timezone: "Asia/Kolkata",
    shiftFrom: "09:00",
    shiftTo: "18:00",
    ctcCurrency: "INR",
    annualCtc: "",
  });
  const [letter, setLetter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const usdBlocked = v.ctcCurrency === "USD" && fte !== "approved";
  const ctc = Number(v.annualCtc);

  async function requestFte() {
    setError(null);
    try {
      const res = await csrfFetch(`/api/employer/${employerId}/international-fte`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (res.ok && data.status) setFte(data.status);
      else if (!res.ok) setError(data.error ?? "Couldn't send the request. Try again.");
    } catch {
      setError("Couldn't send the request. Check your connection and try again.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!letter) return setError("Upload the offer letter (PDF) first.");
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/employer/${employerId}/full-time-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, proposalId, annualCtc: ctc, offerLetterKey: letter }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(data.error ?? "Couldn't send the offer.");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't send the offer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-800 hover:bg-brand-100"
      >
        <BriefcaseBusiness className="size-3.5" aria-hidden />
        Full-time offer
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Full-time offer for {candidate}</DialogTitle>
            <DialogDescription>
              The hiring fee is 8.33% of the annual CTC, paid at checkout once {candidate} accepts.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4 text-sm">
            <label className="block font-medium text-ink-800">
              Job title
              <input required minLength={2} value={v.jobTitle} onChange={set("jobTitle")} className={input} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block font-medium text-ink-800">
                Work mode
                <select value={v.jobMode} onChange={set("jobMode")} className={input}>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </label>
              {v.jobMode !== "remote" ? (
                <>
                  <label className="block font-medium text-ink-800">
                    City
                    <input required value={v.jobLocationCity} onChange={set("jobLocationCity")} className={input} />
                  </label>
                  <label className="block font-medium text-ink-800">
                    State
                    <input required value={v.jobLocationState} onChange={set("jobLocationState")} className={input} />
                  </label>
                </>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block font-medium text-ink-800">
                Shift from
                <input type="time" required value={v.shiftFrom} onChange={set("shiftFrom")} className={input} />
              </label>
              <label className="block font-medium text-ink-800">
                Shift to
                <input type="time" required value={v.shiftTo} onChange={set("shiftTo")} className={input} />
              </label>
              <label className="block font-medium text-ink-800">
                Timezone
                <select value={v.timezone} onChange={set("timezone")} className={input}>
                  {TIMEZONES.filter((t) => !t.group).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <label className="block font-medium text-ink-800">
                Currency
                <select value={v.ctcCurrency} onChange={set("ctcCurrency")} className={input}>
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="block font-medium text-ink-800">
                Annual CTC
                <input type="number" min={1} required value={v.annualCtc} onChange={set("annualCtc")} className={input} />
              </label>
            </div>
            {usdBlocked ? (
              <p className="rounded-[10px] bg-warning-soft px-3 py-2.5 text-xs text-ink-700">
                USD offers need International FTE approval.{" "}
                {fte === "applied" ? (
                  "Your request is with our team."
                ) : (
                  <button type="button" onClick={requestFte} className="font-semibold text-brand-700 underline underline-offset-4">
                    Request approval
                  </button>
                )}
              </p>
            ) : null}
            <FileUpload kind="offer_letter" accept="application/pdf,image/png,image/jpeg" label="Offer letter" hint="PDF, PNG or JPG, up to 10 MB." onUploaded={(r) => setLetter(r.key)} />
            {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || usdBlocked || !(ctc > 0)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send full-time offer"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
