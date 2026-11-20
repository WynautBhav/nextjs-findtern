"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2 } from "lucide-react";

import { LIGHT_TILE, Pill, Surface } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { csrfFetch } from "@/lib/client-fetch";
import { COLLEGE_CODE_CONSENT_NOTICE } from "@/lib/college/code-consent";
import { LEAVE_REASON_MAX } from "@/lib/college/leave-request";
import { isCodeVerifiedMembership } from "@/lib/intern-account";
import type { MyCollege } from "@/lib/college/membership";
import { branchProblem } from "@/lib/college/join-input";
import { cn } from "@/lib/utils";
import { PushToggle } from "./college-push";
import { Choice, controlClass, Label, SelectField } from "./onboarding/fields";

const YEARS = [
  { value: 1, label: "1st year" },
  { value: 2, label: "2nd year" },
  { value: 3, label: "3rd year" },
  { value: 4, label: "4th year" },
  { value: 5, label: "5th year" },
];

export function CollegeForm({
  initial,
  vapidKey,
}: {
  initial: MyCollege | null;
  vapidKey: string;
}) {
  const [editing, setEditing] = useState(!initial);

  if (initial && !editing) {
    return <Membership college={initial} vapidKey={vapidKey} onChange={() => setEditing(true)} />;
  }
  return (
    <JoinForm
      initial={initial}
      onCancel={initial ? () => setEditing(false) : undefined}
      onSaved={() => setEditing(false)}
    />
  );
}

/* ── Already a member ───────────────────────────────────────────────── */

function Membership({
  college,
  vapidKey,
  onChange,
}: {
  college: MyCollege;
  vapidKey: string;
  onChange: () => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();
  const verified = college.status === "verified";

  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const request = college.leaveRequest;
  const pending = request?.status === "requested";
  const rejected = request?.status === "rejected";
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  // Leaving is a request: the college's placement officer decides. Nothing here ends the membership.
  async function send(method: "POST" | "DELETE", body?: unknown) {
    setLeaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/intern/college/leave-request", {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Couldn't do that right now. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach Findtern. Check your connection and try again.");
    } finally {
      setLeaving(false);
    }
  }

  async function requestLeave() {
    const ok = await ask({
      title: `Ask to leave ${college.name}?`,
      body: "Your placement office has to approve this. Until they do, you stay in the college and in its drives. You can cancel the request any time.",
      confirmLabel: "Send request",
      destructive: false,
      extra: (
        <div className="px-1">
          <label htmlFor="leave-reason" className="text-sm font-medium text-ink-800">
            Reason <span className="font-normal text-ink-500">(optional)</span>
          </label>
          <textarea
            id="leave-reason"
            ref={reasonRef}
            rows={3}
            maxLength={LEAVE_REASON_MAX}
            placeholder="Anything your placement office should know"
            className={controlClass(undefined, "mt-1 h-auto w-full resize-none py-2.5 leading-relaxed")}
          />
        </div>
      ),
    });
    if (!ok) return;
    await send("POST", { reason: reasonRef.current?.value.trim() || undefined });
  }

  return (
    <div className={cn("grid gap-8", college.isPartner && "xl:grid-cols-[minmax(0,1fr)_22rem]")}>
      <div className="min-w-0 space-y-8">
        <Surface className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-apple-sm bg-brand-50 text-brand-700">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">{college.name}</h2>
              <p className="mt-0.5 text-sm text-ink-600">
                {[college.year ? YEARS.find((y) => y.value === college.year)?.label : null, college.branch, college.city]
                  .filter(Boolean)
                  .join(" · ") || "Year and branch not set"}
              </p>
              <div className="mt-3">
                {verified ? (
                  <Pill tone="live">
                    <BadgeCheck className="size-3.5" aria-hidden />
                    Verified student
                  </Pill>
                ) : (
                  <Pill tone="waiting">Not verified yet</Pill>
                )}
              </div>
            </div>
          </div>

          <p className="mt-5 border-t border-ink-100 pt-4 text-sm leading-relaxed text-ink-700">
            {verified
              ? college.verifiedBy === "promo" || college.verifiedBy === "college_code" || college.verifiedBy === "drive_code"
                ? "You used your college's code, so employers in its drives see you as a verified student."
                : college.verifiedBy === "roster"
                ? "Your email is on your college's student list, so employers in its drives see you as a verified student."
                : "You signed up with your college email, so employers in its drives see you as a verified student."
              : "Employers in your college's drives only see verified students. You'll be verified when you enter your college's code (ask your placement office), or if you sign up with your college email. Your placement officer can also add you to a drive by hand."}
          </p>

          {!college.isPartner ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Your college doesn&apos;t run drives on Findtern yet. Your choice is saved, so you&apos;re included the day it does.
            </p>
          ) : null}
        </Surface>

        <section>
          {pending && request ? (
            <div className="mt-4 space-y-1">
              <Pill tone="waiting">Leave requested {day(request.requestedAt)} · waiting for placement office</Pill>
              <p className="text-sm text-ink-600">You stay in {college.name} until they approve.</p>
            </div>
          ) : null}
          {rejected && request ? (
            <div className="mt-4 rounded-apple-sm border border-ink-100 bg-ink-50 p-3 text-sm text-ink-700">
              <p className="font-medium text-ink-900">Your placement office did not approve your last request{request.decidedAt ? ` (${day(request.decidedAt)})` : ""}.</p>
              {request.decisionNote ? <p className="mt-1 break-words">Their note: {request.decisionNote}</p> : null}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={onChange} className={cn(buttonVariants({ variant: "outline", size: "md" }))}>
              Change college
            </button>
            {pending ? (
              <button type="button" onClick={() => send("DELETE")} disabled={leaving} className={cn(buttonVariants({ variant: "outline", size: "md" }))}>
                {leaving ? "Cancelling…" : "Cancel request"}
              </button>
            ) : (
              <button
                type="button"
                onClick={requestLeave}
                disabled={leaving}
                className={cn(buttonVariants({ variant: "ghost", size: "md" }), "text-danger hover:bg-danger-soft")}
              >
                {leaving ? "Sending…" : rejected ? "Request again" : "Request to leave"}
              </button>
            )}
            {dialog}
          </div>
          {/* Mounted empty, then filled, so the message is announced. */}
          <div role="alert" className="mt-2 text-sm text-danger">
            {error}
          </div>
        </section>
      </div>

      {/* Drives and call alerts exist only for partner colleges. */}
      {college.isPartner ? (
      <aside className="space-y-4">
        <Surface className="p-5">
          <h2 className="text-base font-semibold text-ink-900">Call alerts</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            During a drive, employers can ask you to a short video call at a few minutes&apos; notice. Alerts make sure you
            don&apos;t miss one.
          </p>
          <PushToggle vapidKey={vapidKey} className="mt-3" />
        </Surface>
      </aside>
      ) : null}
    </div>
  );
}

/* ── Joining with the college's code ─────────────────────────────────── */

/**
 * The only way to join a college: its code. There is no list to pick from and nothing here can name a
 * college, so a student cannot choose one they do not belong to. A wrong code gets one generic answer.
 */
function JoinForm({
  initial,
  onCancel,
  onSaved,
  embedded = false,
  defaultBranch = "",
}: {
  initial: MyCollege | null;
  onCancel?: () => void;
  onSaved: (college: MyCollege) => void;
  /** Inside the profile's Academics step: no card of its own. */
  embedded?: boolean;
  defaultBranch?: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [code, setCode] = useState("");
  const [year, setYear] = useState<number | "">(initial?.year ?? "");
  const [branch, setBranch] = useState(initial?.branch ?? defaultBranch);
  const [adult, setAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which control the message is about: it is marked invalid, tied to the message, and focused.
  const [invalid, setInvalid] = useState<"code" | "adult" | "branch" | null>(null);
  const errorId = `${ids}-error`;

  function fail(message: string, field: "code" | "adult" | "branch") {
    setError(message);
    setInvalid(field);
    document.getElementById(`${ids}-${field}`)?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (code.replace(/[\s._-]/g, "").length < 5) return fail("Enter the college code your placement office gave you.", "code");
    const branchBad = branchProblem(branch);
    if (branchBad) return fail(branchBad, "branch");
    if (!adult) return fail("Confirm that you are 18 or older.", "adult");
    setSaving(true);
    setError(null);
    setInvalid(null);
    try {
      const res = await csrfFetch("/api/intern/college", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, year: year === "" ? null : year, branch: branch.trim(), declaredAdult: adult }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; college?: MyCollege };
      if (!res.ok || !body.college) {
        fail(body.error ?? "Couldn't check the code. Try again.", "code");
        return;
      }
      setCode("");
      onSaved(body.college);
      router.refresh();
    } catch {
      fail("Couldn't check the code. Check your connection and try again.", "code");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "space-y-6",
        embedded ? "" : cn("max-w-3xl rounded-apple-xl border border-ink-200/80 bg-white p-5 sm:p-8", LIGHT_TILE),
      )}
      noValidate
    >
      <section>
        <Label htmlFor={`${ids}-code`}>College code</Label>
        <input
          id={`${ids}-code`}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (invalid === "code") {
              setInvalid(null);
              setError(null);
            }
          }}
          maxLength={24}
          required
          aria-required="true"
          aria-invalid={invalid === "code" || undefined}
          aria-describedby={invalid === "code" ? `${ids}-code-hint ${errorId}` : `${ids}-code-hint`}
          placeholder="FT followed by your code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={controlClass(invalid === "code" ? (error ?? "invalid") : undefined, "mt-2 font-mono uppercase tracking-wider sm:max-w-xs")}
        />
        <p id={`${ids}-code-hint`} className="mt-2 text-sm leading-relaxed text-ink-600">
          Ask your college&apos;s placement cell for your college code. It starts with FT. Without it you can still use an individual account.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${ids}-year`}
          label="Year of study"
          value={year === "" ? "" : String(year)}
          onChange={(v) => setYear(v ? Number(v) : "")}
          options={YEARS.map((y) => ({ value: String(y.value), label: y.label }))}
          placeholder="Choose"
        />
        <div>
          <Label htmlFor={`${ids}-branch`}>Branch</Label>
          <input
            id={`${ids}-branch`}
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
              if (invalid === "branch") {
                setInvalid(null);
                setError(null);
              }
            }}
            maxLength={120}
            required
            aria-required="true"
            aria-invalid={invalid === "branch" || undefined}
            aria-describedby={invalid === "branch" ? errorId : undefined}
            placeholder="e.g. CSE, ECE, BBA"
            autoComplete="off"
            className={controlClass(undefined, "mt-2")}
          />
        </div>
        <p className="text-sm leading-relaxed text-ink-600 sm:col-span-2">
          If your college has you on its student list, the year and branch on that list are used instead.
        </p>
      </section>

      <label htmlFor={`${ids}-adult`} className="flex cursor-pointer items-start gap-3">
        <Checkbox
          id={`${ids}-adult`}
          checked={adult}
          onCheckedChange={(v) => {
            setAdult(v === true);
            setError(null);
            setInvalid(null);
          }}
          aria-invalid={invalid === "adult" ? true : undefined}
          aria-describedby={invalid === "adult" ? errorId : undefined}
          className="mt-0.5 size-5"
        />
        <span className="text-sm leading-relaxed text-ink-800">
          {COLLEGE_CODE_CONSENT_NOTICE}{" "}
          <span className="text-ink-600">If you&apos;re under 18, ask your placement office to add you with a parent&apos;s consent.</span>
        </span>
      </label>

      {/* Mounted empty, then filled, so the message is announced. */}
      <div id={errorId} role="alert" className="text-sm font-medium text-danger">
        {error}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className={cn(buttonVariants({ variant: embedded ? "outline" : "primary", size: "md" }))}>
          {saving ? "Checking…" : initial ? "Change college" : "Verify code"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={cn(buttonVariants({ variant: "light", size: "md" }))}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/* ── In the profile's Academics step ─────────────────────────────────── */

const ACCOUNT_TYPES = [
  { value: "individual", label: "Individual account" },
  { value: "college", label: "College account" },
] as const;

/**
 * "Individual or college account?", required, with nothing preselected. Choosing College shows the code
 * form (nothing else: no list of colleges); the account only becomes a college account once the server has
 * accepted the code. Changing or leaving the college later happens in Settings.
 */
export function AccountTypeChoice({
  value,
  onChange,
  error,
  college,
  defaultBranch,
}: {
  value: "individual" | "college" | "" | undefined;
  onChange: (type: "individual" | "college") => void;
  error?: string;
  college: MyCollege | null;
  defaultBranch: string;
}) {
  const [joined, setJoined] = useState<MyCollege | null>(null);
  const mine = joined ?? college;
  const verified = isCodeVerifiedMembership(mine ? { status: mine.status, verifiedBy: mine.verifiedBy } : null);

  return (
    <div className="space-y-4">
      <Choice
        id="accountType"
        label="Is this an individual account or a college account?"
        value={value}
        options={ACCOUNT_TYPES}
        error={error}
        hint="Choose College account only if your college's placement cell gave you a college code."
        onChange={onChange}
      />
      {/* Always mounted, then filled, so the success is announced. */}
      <p role="status" aria-live="polite" className="sr-only">
        {value === "college" && verified && mine ? `College code accepted. You joined ${mine.name}.` : ""}
      </p>
      {value === "college" ? (
        verified && mine ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-apple-xl border border-ink-200/80 bg-white p-5 text-sm">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-apple-sm bg-brand-50 text-brand-700">
              <BadgeCheck className="size-4" />
            </span>
            <p className="min-w-0 flex-1 text-ink-700">
              College code accepted. You&apos;ve joined <span className="font-medium text-ink-900">{mine.name}</span> as a verified student.
            </p>
            <Link
              href="/intern/settings#college"
              className="inline-flex min-h-11 items-center rounded-apple-sm px-2 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              Manage in Settings
            </Link>
          </div>
        ) : (
          <div className="details-reveal rounded-apple-xl border border-ink-200/80 bg-white p-5">
            <JoinForm embedded initial={null} defaultBranch={defaultBranch} onSaved={(c) => { setJoined(c); onChange("college"); }} />
          </div>
        )
      ) : null}
    </div>
  );
}
