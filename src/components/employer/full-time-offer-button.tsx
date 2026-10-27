"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Loader2 } from "lucide-react";

import { CountdownAgreement } from "@/components/app/countdown-agreement";
import { FileUpload } from "@/components/app/file-upload";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { CityField, StateField } from "@/components/employer/location-fields";
import { fieldClass, labelClass } from "@/components/employer/ui-tokens";
import { fullTimeFeeMinor } from "@/lib/checkout";
import { csrfFetch } from "@/lib/client-fetch";
import { formatMoney } from "@/lib/format";
import { TIMEZONES } from "@/lib/timezones";
import { cn } from "@/lib/utils";

/** Legacy "Important notice" before a company outside India offers in USD (EMH-22). */
const USD_NOTICE = [
  {
    title: "Hiring from outside India",
    lines: [
      "If your organization is located outside India, please note that hiring a candidate directly on a full-time basis may require compliance with local employment and work visa regulations.",
      "To simplify this process and eliminate visa-related complexities, Findtern offers a payroll-managed hiring option. Under this arrangement, the employer remits the salary to Findtern, and Findtern manages payroll and salary disbursement to the candidate in compliance with applicable regulations.",
      "Employers opting for this model will be charged a one-time full-time conversion fee of 8.33% of the total Annual CTC. No recurring hiring fees apply.",
    ],
  },
];

/** Offer a hired intern a full-time role (legacy "Full-time offer"). */
export function FullTimeOfferButton({
  employerId,
  proposalId,
  candidate,
  fteStatus: initialFte,
  timezone = "Asia/Kolkata",
  className,
}: {
  employerId: string;
  proposalId: string;
  candidate: string;
  fteStatus: string;
  /** The company's timezone, from its location. */
  timezone?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [fte, setFte] = useState(initialFte);
  const [v, setV] = useState({
    jobTitle: "",
    jobMode: "remote",
    jobLocationCity: "",
    jobLocationState: "",
    timezone,
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
  const feeMinor = ctc > 0 ? fullTimeFeeMinor(Math.round(ctc * 100)) : 0;

  async function requestFte() {
    setError(null);
    setNoticeBusy(true);
    try {
      const res = await csrfFetch(`/api/employer/${employerId}/international-fte`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (res.ok && data.status) setFte(data.status);
      else if (!res.ok) setError(data.error ?? "Couldn't send the request. Try again.");
      setNotice(false);
    } catch {
      setError("Couldn't send the request. Check your connection and try again.");
    } finally {
      setNoticeBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!letter) return setError("Upload the offer letter (PDF) first.");
    if (v.jobMode !== "remote" && (!v.jobLocationState || !v.jobLocationCity)) return setError("Pick the city and state of the role.");
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
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "outline", size: "sm", className: cn("min-h-11", className) })}>
        <BriefcaseBusiness className="size-4" aria-hidden />
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
          <form onSubmit={submit} className="space-y-4">
            <label className={labelClass}>
              Job title
              <input required minLength={2} value={v.jobTitle} onChange={set("jobTitle")} className={cn(fieldClass, "mt-1.5")} />
            </label>
            <label className={labelClass}>
              Work mode
              <select value={v.jobMode} onChange={set("jobMode")} className={cn(fieldClass, "mt-1.5")}>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </label>
            {v.jobMode !== "remote" ? (
              <div>
                {/* EMH-06: legacy offered Indian cities only, state filled from the city. */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <StateField
                    id={`ft-state-${proposalId}`}
                    label="State"
                    india
                    required
                    value={v.jobLocationState}
                    onChange={(state) => setV((s) => ({ ...s, jobLocationState: state, jobLocationCity: "" }))}
                  />
                  <CityField
                    id={`ft-city-${proposalId}`}
                    label="City"
                    india
                    required
                    state={v.jobLocationState}
                    value={v.jobLocationCity}
                    onChange={(city) => setV((s) => ({ ...s, jobLocationCity: city }))}
                    onStateChange={(state) => setV((s) => ({ ...s, jobLocationState: state }))}
                  />
                </div>
                <p className="mt-1.5 text-xs text-ink-500">Only Indian locations: candidates are India-based.</p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>
                Shift from
                <input type="time" required value={v.shiftFrom} onChange={set("shiftFrom")} className={cn(fieldClass, "mt-1.5")} />
              </label>
              <label className={labelClass}>
                Shift to
                <input type="time" required value={v.shiftTo} onChange={set("shiftTo")} className={cn(fieldClass, "mt-1.5")} />
              </label>
              <label className={labelClass}>
                Timezone
                <select value={v.timezone} onChange={set("timezone")} className={cn(fieldClass, "mt-1.5")}>
                  {TIMEZONES.filter((t) => !t.group).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <label className={labelClass}>
                Currency
                <select
                  value={v.ctcCurrency}
                  onChange={(e) => {
                    const next = e.target.value;
                    setV((s) => ({ ...s, ctcCurrency: next }));
                    // Legacy showed the notice the moment USD was picked.
                    if (next === "USD" && fte !== "approved" && fte !== "applied") setNotice(true);
                  }}
                  className={cn(fieldClass, "mt-1.5")}
                >
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className={labelClass}>
                Annual CTC
                <input type="number" min={1} required inputMode="numeric" value={v.annualCtc} onChange={set("annualCtc")} className={cn(fieldClass, "nums mt-1.5")} />
              </label>
            </div>
            <div className="rounded-apple-md bg-ink-50 px-4 py-3">
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-600">One-time hiring fee (8.33% of annual CTC)</span>
                <span className="nums font-semibold text-ink-900">{feeMinor > 0 ? formatMoney(feeMinor, v.ctcCurrency, { zeroLabel: false }) : "-"}</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                The recruitment fee charged by Findtern is separate from the candidate&apos;s CTC and is not included within the offered compensation package. It is payable independently by the hiring organization.
              </p>
            </div>
            {usdBlocked ? (
              <p className="rounded-apple-md bg-warning-soft px-4 py-3 text-sm text-ink-800">
                USD offers need International FTE approval.{" "}
                {fte === "applied" ? (
                  "Your request is with our team."
                ) : (
                  <button type="button" onClick={() => setNotice(true)} className="font-semibold text-brand-700 underline underline-offset-4">
                    Request approval
                  </button>
                )}
              </p>
            ) : null}
            <FileUpload kind="offer_letter" accept="application/pdf,image/png,image/jpeg" label="Offer letter" hint="PDF, PNG or JPG, up to 10 MB." onUploaded={(r) => setLetter(r.key)} />
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={busy || usdBlocked || !(ctc > 0)} className={buttonClass({ block: true })}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? "Sending…" : "Send full-time offer"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <CountdownAgreement
        open={notice}
        onOpenChange={setNotice}
        title="Important notice"
        sections={USD_NOTICE}
        agreeLabel="I understand and want to enable this option"
        confirmLabel="Request approval"
        onConfirm={requestFte}
        busy={noticeBusy}
        seconds={10}
      />
    </>
  );
}
