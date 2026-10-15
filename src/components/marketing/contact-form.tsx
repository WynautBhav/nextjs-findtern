"use client";

import { useId, useState } from "react";
import { AlertCircle, Check, Send } from "lucide-react";

import { SITE } from "@/lib/content/site";
import { cn } from "@/lib/utils";

/**
 * Contact form.
 *
 * Client-validated, posted to /api/website/contact. That endpoint lives on
 * the legacy Express server rather than in this Next app, so the form
 * degrades instead of dead-ending: on failure the visitor still gets a
 * prefilled mailto carrying everything they typed, instead of losing it.
 *
 * Three behaviours carried over from the legacy form, and one fixed:
 *  - a work-email check on hiring enquiries, live-revalidated as you type
 *    rather than only on submit;
 *  - a split country-code / number field;
 *  - every failure announced in a live region. The legacy version blocked
 *    submit silently, which reads as a broken form rather than a rejected
 *    one.
 */
type Values = {
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  phone: string;
  queryType: "intern" | "general" | "hiring";
  subject: string;
  message: string;
};

const INITIAL: Values = {
  firstName: "",
  lastName: "",
  email: "",
  countryCode: "+91",
  phone: "",
  queryType: "general",
  subject: "",
  message: "",
};

/** The legacy blocklist, kept so the same addresses are refused. */
const FREE_EMAIL = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "protonmail.com",
  "icloud.com",
  "yandex.com",
  "live.com",
];

const PLACEHOLDER: Record<Values["queryType"], string> = {
  general: "What are you trying to do?",
  hiring: "The role, the duration, and roughly what you need from the intern.",
  intern: "What kind of internship you are looking for, and in which field.",
};

export function ContactForm() {
  const [v, setV] = useState<Values>(INITIAL);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  const emailProblem =
    v.queryType === "hiring" && v.email.includes("@")
      ? FREE_EMAIL.includes(v.email.split("@")[1]?.toLowerCase() ?? "")
        ? "Use your work email for a hiring enquiry."
        : null
      : null;

  const missing = [
    !v.firstName.trim() && "first name",
    !v.lastName.trim() && "last name",
    !v.email.includes("@") && "email address",
    v.message.trim().length < 10 && "a message of at least 10 characters",
  ].filter(Boolean) as string[];

  const valid = missing.length === 0 && !emailProblem;

  const set =
    (k: keyof Values) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setV((prev) => ({ ...prev, [k]: e.target.value }));
      if (status === "error") setStatus("idle");
    };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(`Still needed: ${missing.join(", ")}.`);
      setStatus("error");
      return;
    }

    setStatus("sending");
    setError(null);

    try {
      const res = await fetch("/api/website/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("sent");
    } catch {
      setStatus("error");
      setError(
        "The form endpoint is not connected in this build, so nothing was sent. Your message is ready to go by email instead.",
      );
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col items-center rounded-2xl border border-brand-200 bg-brand-50 px-8 py-16 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary text-white">
          <Check className="size-6" aria-hidden />
        </span>
        <h3 className="mt-5 text-xl font-semibold tracking-tight text-ink-900">
          Message sent
        </h3>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-ink-600">
          We read every one. If it needs a faster answer, email{" "}
          <a
            href={`mailto:${SITE.email}`}
            className="font-medium text-primary underline underline-offset-4"
          >
            {SITE.email}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${uid}-fn`} label="First name" required>
          <input
            id={`${uid}-fn`}
            value={v.firstName}
            onChange={set("firstName")}
            autoComplete="given-name"
            required
            className={inputCls}
          />
        </Field>

        <Field id={`${uid}-ln`} label="Last name" required>
          <input
            id={`${uid}-ln`}
            value={v.lastName}
            onChange={set("lastName")}
            autoComplete="family-name"
            required
            className={inputCls}
          />
        </Field>

        <Field id={`${uid}-qt`} label="Query type" className="sm:col-span-2">
          <select
            id={`${uid}-qt`}
            value={v.queryType}
            onChange={set("queryType")}
            className={inputCls}
          >
            <option value="general">General question</option>
            <option value="hiring">I want to hire an intern</option>
            <option value="intern">I am looking for an internship</option>
          </select>
        </Field>

        <Field
          id={`${uid}-em`}
          label="Email address"
          required
          error={emailProblem}
          hint={
            v.queryType === "hiring" && !emailProblem
              ? "Work email only for hiring enquiries"
              : undefined
          }
        >
          <input
            id={`${uid}-em`}
            type="email"
            value={v.email}
            onChange={set("email")}
            autoComplete="email"
            required
            aria-invalid={emailProblem ? true : undefined}
            className={cn(inputCls, emailProblem && "border-danger")}
          />
        </Field>

        <Field id={`${uid}-ph`} label="Phone" hint="Optional">
          <div className="flex gap-2">
            <select
              aria-label="Country code"
              value={v.countryCode}
              onChange={set("countryCode")}
              className={cn(inputCls, "w-28 shrink-0")}
            >
              {["+91", "+1", "+44", "+61", "+65", "+971", "+27"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              id={`${uid}-ph`}
              type="tel"
              value={v.phone}
              onChange={set("phone")}
              autoComplete="tel-national"
              className={inputCls}
            />
          </div>
        </Field>

        <Field id={`${uid}-su`} label="Subject" className="sm:col-span-2" hint="Optional">
          <input
            id={`${uid}-su`}
            value={v.subject}
            onChange={set("subject")}
            className={inputCls}
          />
        </Field>

        <Field id={`${uid}-me`} label="Message" required className="sm:col-span-2">
          <textarea
            id={`${uid}-me`}
            rows={6}
            value={v.message}
            onChange={set("message")}
            required
            placeholder={PLACEHOLDER[v.queryType]}
            className={cn(inputCls, "resize-y py-3")}
          />
        </Field>
      </div>

      {status === "error" && error ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {error}
            {error.includes("not connected") ? (
              <>
                {" "}
                <a
                  href={mailto(v)}
                  className="font-semibold underline underline-offset-4"
                >
                  Open it in your email client
                </a>
                .
              </>
            ) : null}
          </span>
        </p>
      ) : null}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-ease-out hover:bg-primary-hover hover:shadow-md active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55"
        >
          <Send className="size-4" aria-hidden />
          {status === "sending" ? "Sending…" : "Send message"}
        </button>
        <a
          href={mailto(v)}
          className="text-sm text-ink-500 underline underline-offset-4 transition-colors hover:text-primary"
        >
          or email us directly
        </a>
      </div>
    </form>
  );
}

const inputCls =
  "h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-base text-ink-900 shadow-sm transition-colors duration-200 placeholder:text-ink-400 hover:border-ink-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-ink-700"
      >
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

function mailto(v: Values) {
  const subject = v.subject || `Findtern enquiry - ${v.queryType}`;
  const body = [
    `Name: ${v.firstName} ${v.lastName}`,
    `Email: ${v.email}`,
    v.phone ? `Phone: ${v.countryCode} ${v.phone}` : "",
    `Query: ${v.queryType}`,
    "",
    v.message,
  ]
    .filter(Boolean)
    .join("\n");
  return `mailto:${SITE.email}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}
