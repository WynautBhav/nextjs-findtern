"use client";

/**
 * The AI interview, everywhere a candidate meets it.
 *
 * One state machine (src/lib/ai-interview.ts) behind two surfaces:
 *  - `AiInterviewAction`: the inline step on Home (apply, wait, join, done);
 *  - `AiInterviewJoinCard`: the card at the top of the interviews page.
 *
 * Joining always goes through the legacy terms gate: the instructions, a
 * tick, and a 10 second countdown before "Proceed" unlocks (INW-19, legacy
 * CandidateHeader.tsx:955-1060). While the candidate waits for a link, the
 * state is re-read every 15 s, as legacy did, so the Join button appears
 * without a reload (INT-31).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CheckCircle2, Clock, Loader2, Video } from "lucide-react";

import { Pill, Surface } from "@/components/app/primitives";
import { CountdownAgreement, type AgreementSection } from "@/components/app/countdown-agreement";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { aiInterviewPhase, joinableLink, type AiInterviewPhase } from "@/lib/ai-interview";

/** Legacy "AI Interview: Terms & Instructions", in substance. */
const AI_TERMS: AgreementSection[] = [
  {
    title: "Before you start",
    lines: ["The interview runs in a new tab. Give it your full attention until it ends."],
    bullets: [
      "Use a stable internet connection and a quiet room.",
      "Allow microphone and camera access when the browser asks.",
      "Do not refresh or close the interview window once it has started.",
      "Your performance is evaluated and becomes part of your profile as your Findtern Score.",
    ],
  },
];

const POLL_MS = 15_000;

type State = { phase: AiInterviewPhase; link: string | null };

/** Re-reads the phase while it can still change on its own (an admin sets the link). */
function useAiState(internId: string | null, initial: State) {
  const router = useRouter();
  const [state, setState] = useState<State>(initial);
  // The last phase seen, read by the poll; a setState updater must stay pure, so router.refresh lives outside it.
  const phaseRef = useRef(initial.phase);
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  const refresh = useCallback(async () => {
    if (!internId) return;
    try {
      const res = await csrfFetch(`/api/intern/${encodeURIComponent(internId)}/ai-interview/apply`, { method: "GET" });
      if (!res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { phase?: AiInterviewPhase; meetingLink?: string | null };
      if (!body.phase) return;
      const changed = phaseRef.current !== body.phase;
      phaseRef.current = body.phase;
      setState({ phase: body.phase, link: joinableLink(body.meetingLink) });
      if (changed) router.refresh();
    } catch {
      // A failed poll keeps the last known state; the next tick tries again.
    }
  }, [internId, router]);

  useEffect(() => {
    if (!internId || state.phase !== "waiting") return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [internId, state.phase, refresh]);

  return [state, setState, refresh] as const;
}

function JoinGate({ link, block, label = "Join AI interview" }: { link: string; block?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "primary", block })}>
        <Video className="size-4" aria-hidden />
        {label}
      </button>
      <CountdownAgreement
        open={open}
        onOpenChange={setOpen}
        title="AI interview: terms and instructions"
        description="Please read and agree before starting. Proceed unlocks after 10 seconds."
        sections={AI_TERMS}
        agreeLabel="I have read the instructions and I agree to proceed."
        confirmLabel="Proceed to interview"
        seconds={10}
        onConfirm={() => {
          window.open(link, "_blank", "noopener,noreferrer");
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * The step on Home. The server passes the phase it already derived; this
 * owns the apply POST, the poll while waiting, and the gated join.
 */
export function AiInterviewAction({
  internId,
  initialPhase,
  initialLink,
  sync = false,
}: {
  internId: string;
  initialPhase: AiInterviewPhase;
  initialLink: string | null;
  /** Re-read the phase on mount, for callers that don't know it. */
  sync?: boolean;
}) {
  const router = useRouter();
  const [state, setState, refresh] = useAiState(internId, { phase: initialPhase, link: joinableLink(initialLink) });
  useEffect(() => {
    if (sync) void refresh();
  }, [sync, refresh]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/intern/${encodeURIComponent(internId)}/ai-interview/apply`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        setState({ phase: "waiting", link: null });
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Could not register your application.");
      setState({ phase: "waiting", link: null });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register your application.");
    } finally {
      setBusy(false);
    }
  }

  if (state.phase === "apply") {
    return (
      <div>
        <p className="text-sm leading-relaxed text-ink-600">
          Request the interview and the link reaches you here and by email, usually within 24 to 48 hours.
        </p>
        <button type="button" onClick={apply} disabled={busy} className={buttonClass({ className: "mt-4" })}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarCheck className="size-4" aria-hidden />}
          Apply for the AI interview
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (state.phase === "waiting") {
    return (
      <p className="flex items-start gap-2.5 rounded-apple-md bg-accent-100/60 px-4 py-3 text-sm leading-relaxed text-ink-800">
        <Clock className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
        <span>
          <span className="font-semibold">You have applied.</span> Your interview link goes live within 24 to 48
          hours and appears right here, with a notification.
        </span>
      </p>
    );
  }

  if (state.phase === "ready" && state.link) {
    return (
      <div>
        <p className="text-sm leading-relaxed text-ink-600">
          Your AI interview is unlocked. Start when you are somewhere quiet with a steady connection.
        </p>
        <div className="mt-4">
          <JoinGate link={state.link} />
        </div>
      </div>
    );
  }

  if (state.phase === "completed") {
    return (
      <p className="text-sm leading-relaxed text-ink-600">
        Interview done. Your Findtern Score is being prepared and appears here once it is published.
      </p>
    );
  }

  return (
    <p className="text-sm leading-relaxed text-ink-600">
      Done. Your Findtern Score is on{" "}
      <Link href="/intern/record" className="font-medium text-primary underline-offset-4 hover:underline">
        your record
      </Link>
      .
    </p>
  );
}

interface AiInterviewJoinCardProps {
  interviewId: string;
  status: string | null;
  meetingLink: string | null;
  updatedAt?: string | null;
  /** When given, the card keeps itself current while waiting for the link. */
  internId?: string | null;
  /** Score published: the card says so instead of offering a join. */
  scored?: boolean;
}

const PHASE_PILL: Record<AiInterviewPhase, { tone: "live" | "waiting" | "closed" | "paid"; label: string } | null> = {
  apply: null,
  waiting: { tone: "waiting", label: "Link on its way" },
  ready: { tone: "live", label: "Ready to start" },
  completed: { tone: "closed", label: "Completed" },
  scored: { tone: "paid", label: "Score published" },
};

/** The AI interview card on the interviews page. */
export function AiInterviewJoinCard({ interviewId, status, meetingLink, internId = null, scored = false }: AiInterviewJoinCardProps) {
  const initial = aiInterviewPhase(
    { id: interviewId, employerId: "admin", status, meetingLink, createdAt: null },
    scored,
  );
  const [state] = useAiState(internId, { phase: initial, link: joinableLink(meetingLink) });
  const pill = PHASE_PILL[state.phase];

  return (
    <Surface as="section" aria-labelledby={`ai-${interviewId}`} className="p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-apple-md bg-brand-50 text-brand-700" aria-hidden>
            <Video className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 id={`ai-${interviewId}`} className="text-base font-semibold tracking-[-0.01em] text-ink-900">
              AI Interview
            </h3>
            <p className="mt-1 max-w-xl text-pretty text-sm leading-relaxed text-ink-600">
              {state.phase === "scored"
                ? "Your Findtern Score is published. Employers shortlist on it."
                : state.phase === "completed"
                  ? "Done. Your score is being prepared and appears on your record once published."
                  : state.phase === "ready"
                    ? "Your link is ready. Start when you are somewhere quiet with a steady connection."
                    : "We are setting up your link. It goes live within 24 to 48 hours and appears here."}
            </p>
          </div>
        </div>
        {pill ? <Pill tone={pill.tone}>{pill.label}</Pill> : null}
      </div>

      {state.phase === "ready" && state.link ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <p className="flex items-center gap-2 text-sm font-medium text-brand-800">
            <CheckCircle2 className="size-4" aria-hidden />
            Read the instructions, then join.
          </p>
          <JoinGate link={state.link} />
        </div>
      ) : null}

      {state.phase === "scored" ? (
        <div className="mt-4 border-t border-ink-100 pt-4">
          <Link href="/intern/record" className={buttonClass({ variant: "outline", size: "sm" })}>
            See your score
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}
    </Surface>
  );
}
