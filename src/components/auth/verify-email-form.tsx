"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check } from "lucide-react";

const field =
  "mt-2 h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-[border-color,box-shadow] placeholder:text-ink-500 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20";
const button =
  "h-11 w-full rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60";

type Answer = { error?: string; resendAfterSeconds?: number; remainingSeconds?: number; delivery?: string };

async function post(url: string, body: unknown): Promise<Answer> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Answer;
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong. Try again."), { answer: data });
  return data;
}

export function VerifyEmailForm({ role, initialEmail, loginHref }: { role: "intern" | "employer"; initialEmail: string; loginHref: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Seconds until another code may be requested (INT-24). */
  const [resendIn, setResendIn] = useState(0);
  const [mailLogged, setMailLogged] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      const remaining = (e as { answer?: Answer }).answer?.remainingSeconds;
      if (typeof remaining === "number") setResendIn(remaining);
    } finally {
      setBusy(false);
    }
  }

  function sendCode() {
    void run(async () => {
      const data = await post("/api/auth/signup/send-otp", { email, subjectType: role, purpose: "verify" });
      setResendIn(data.resendAfterSeconds ?? 60);
      setMailLogged(data.delivery === "log");
      setStep("code");
    });
  }

  // Arriving from "Verify it now" on the sign-in page, the address is already
  // known: send the code straight away instead of asking for a second click.
  const autoSent = useRef(false);
  useEffect(() => {
    if (autoSent.current || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(initialEmail)) return;
    autoSent.current = true;
    sendCode();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step === "done") {
    return (
      <div role="status" className="space-y-5 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary text-white">
          <Check className="size-5" aria-hidden />
        </span>
        <p className="text-sm text-ink-700">Your email is verified. You can sign in now.</p>
        <Link href={loginHref} className={`${button} inline-flex items-center justify-center`}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "email") {
          sendCode();
        } else {
          void run(async () => {
            await post("/api/auth/signup/verify-otp", { email, otp: code, subjectType: role });
            await post("/api/auth/verify-email", { email, role });
            setStep("done");
          });
        }
      }}
    >
      {error ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink-800">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          readOnly={step === "code"}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </div>
      {step === "code" ? (
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-ink-800">
            6-digit code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${field} tracking-[0.4em]`}
          />
          <p className="mt-1.5 text-xs text-text-subtle">
            If {email} has an account waiting for verification, a code is on its way. It expires in
            10 minutes.{" "}
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setStep("email")}>
              Change email
            </button>
            {" · "}
            <button
              type="button"
              disabled={busy || resendIn > 0}
              className="font-medium text-brand-700 hover:underline disabled:no-underline disabled:opacity-60"
              onClick={sendCode}
            >
              {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, "0")}` : "Resend code"}
            </button>
          </p>
          {mailLogged ? (
            <p role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-3 text-sm text-ink-800">
              This is a test server: emails are written to its log instead of being sent.
            </p>
          ) : null}
        </div>
      ) : null}
      <button type="submit" disabled={busy || !email.includes("@") || (step === "code" && code.length !== 6)} className={button}>
        {step === "email" ? "Email me a code" : "Verify"}
      </button>
    </form>
  );
}
