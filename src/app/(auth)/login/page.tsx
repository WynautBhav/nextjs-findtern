import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { AlertCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { DoorSwitch } from "@/components/auth/door-switch";
import { LoginForm } from "@/components/auth/login-form";
import { authPath, DOOR_POINTS, doorOf, LAST_DOOR_COOKIE, type Door } from "@/lib/auth-doors";
import { googleLoginEnabled, oauthErrorMessage, safeNext } from "@/lib/google";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** What each account type's sign in says and where it posts. */
const DOOR: Record<
  Door,
  { title: string; subtitle: string; points: { lead: string; text: string }[]; heading: string; lede: string; email: string; endpoint: string; home: string }
> = {
  intern: {
    title: "Your score, your rate, your offers.",
    subtitle: "One AI interview sets your Findtern Score, and the score sets what employers pay you. You see both first.",
    points: DOOR_POINTS.intern,
    heading: "Welcome back",
    lede: "Sign in to your intern account.",
    email: "you@gmail.com",
    endpoint: "/api/auth/login",
    home: "/intern/dashboard",
  },
  employer: {
    title: "Hire interns already screened.",
    subtitle: "Filter on Findtern Score, skills and interests, then send a proposal in one sitting.",
    points: DOOR_POINTS.employer,
    heading: "Welcome back",
    lede: "Sign in to your company's hiring dashboard.",
    email: "you@company.com",
    endpoint: "/api/auth/employer/login",
    home: "/employer/dashboard",
  },
  college: {
    title: "Your students, your drives.",
    subtitle: "See who has joined, how they scored in the AI interview, and run virtual placement drives employers join with one link.",
    heading: "Placement console",
    points: [
      { lead: "Every student in one list", text: "Who has joined, who has taken the AI interview, and how they scored." },
      { lead: "Virtual placement drives", text: "Employers join a drive with one link." },
    ],
    lede: "For placement officers of partner colleges.",
    email: "you@yourcollege.ac.in",
    endpoint: "/api/auth/college/login",
    home: "/college",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // No `as`: open on the type this browser last signed in as.
  const door = doorOf(params.as ?? (await cookies()).get(LAST_DOOR_COOKIE)?.value);
  const d = DOOR[door];
  const oauthError = oauthErrorMessage(one(params.oauthError));
  // Where sign in returns to (INT-07 / EMH-37): the page that sent them here.
  const next = safeNext(one(params.next), "");
  const google = door !== "college" && googleLoginEnabled() ? `/api/auth/google/start?${new URLSearchParams(next ? { role: door, next } : { role: door })}` : undefined;

  return (
    <AuthShell title={d.title} subtitle={d.subtitle} points={d.points}>
      <DoorSwitch path="/login" doors={["intern", "employer", "college"]} current={door} keep={{ next }} />

      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{d.heading}</h1>
      <p className="mt-1.5 text-sm text-text-subtle">{d.lede}</p>

      {oauthError ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{oauthError}</span>
        </div>
      ) : null}

      <div className="mt-8">
        <LoginForm
          // A fresh form per type, so a half-typed password never carries over.
          key={door}
          endpoint={d.endpoint}
          emailPlaceholder={d.email}
          redirectTo={next || d.home}
          forgotHref={door === "college" ? undefined : authPath("/forgot-password", door)}
          googleHref={google}
          googleLabel="Sign in or sign up with Google"
          verifyHref={door === "college" ? undefined : authPath("/verify-email", door)}
          rememberAs={door}
        />
      </div>

      {door === "college" ? (
        <p className="mt-7 text-sm text-text-subtle">
          Forgot your password, or need a login for a colleague?{" "}
          <Link href="/contact" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
            Ask Findtern
          </Link>
          . Placement console logins are issued and reset by our team.
        </p>
      ) : (
        <p className="mt-7 text-center text-sm text-text-subtle">
          New to Findtern?{" "}
          <Link href={authPath("/signup", door, { next })} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
            {door === "employer" ? "Register your company" : "Create an account"}
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
