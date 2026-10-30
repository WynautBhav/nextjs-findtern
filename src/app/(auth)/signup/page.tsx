import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { DoorSwitch } from "@/components/auth/door-switch";
import { GoogleButton } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { EmployerSignupForm } from "@/components/employer/employer-signup-form";
import { authPath, DOOR_POINTS, doorOf } from "@/lib/auth-doors";
import { googleLoginEnabled, oauthErrorMessage, safeNext } from "@/lib/google";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // College logins are issued by Findtern, so there is no college signup.
  const door = doorOf(params.as, ["intern", "employer"]);
  const isEmployer = door === "employer";
  const oauthError = oauthErrorMessage(one(params.oauthError));
  // Carried through from sign in (INT-07), so a new account still lands on
  // the page that sent them.
  const next = safeNext(one(params.next), "");
  // Back from Google with a verified address and no account yet. The values
  // only prefill the form; the signup API checks the verification itself.
  const fromGoogle = one(params.google) === "1" && one(params.email);
  const internGoogle = fromGoogle && !isEmployer ? { email: one(params.email), firstName: one(params.firstName), lastName: one(params.lastName) } : null;
  const employerGoogle = fromGoogle && isEmployer ? { email: one(params.email), name: one(params.name) } : null;
  const showGoogle = !fromGoogle && googleLoginEnabled();

  return (
    <AuthShell
      title={isEmployer ? "Register the company, not a person." : "One interview sets your rate."}
      subtitle={
        isEmployer
          ? "One company account, one billing identity for all your hiring."
          : "Create an account, verify your email, and finish your profile. Employers see the same profile you do."
      }
      points={DOOR_POINTS[door]}
    >
      {/* Mid-way through a Google signup the type is already decided. */}
      {fromGoogle ? null : <DoorSwitch path="/signup" doors={["intern", "employer"]} current={door} keep={{ next }} />}

      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        {fromGoogle ? "Finish creating your account" : isEmployer ? "Register your company" : "Create your account"}
      </h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        {fromGoogle
          ? isEmployer
            ? "Google has confirmed your company email. Add the rest to finish."
            : "Google has confirmed your email. Add your phone number and a password to finish."
          : isEmployer
            ? "Takes about a minute. A company email address is required."
            : "We verify your email with a one-time code before anything is created."}
      </p>

      {oauthError ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{oauthError}</span>
        </div>
      ) : null}

      {showGoogle ? (
        <div className="mt-8 space-y-5">
          <GoogleButton href={`/api/auth/google/start?${new URLSearchParams(next ? { role: door, next } : { role: door })}`} label="Sign up with Google" />
          <p className="text-center text-sm text-ink-600">or with your email</p>
        </div>
      ) : null}

      <div className={showGoogle ? "mt-5" : "mt-8"}>
        {isEmployer ? (
          <EmployerSignupForm key="employer" google={employerGoogle} next={next || undefined} />
        ) : (
          <SignupForm key="intern" google={internGoogle} next={next || undefined} />
        )}
      </div>

      <p className="mt-7 text-center text-sm text-text-subtle">
        Already have an account?{" "}
        <Link href={authPath("/login", door, { next })} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
