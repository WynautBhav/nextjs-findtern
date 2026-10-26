"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Video,
} from "lucide-react";

import { Surface, Pill } from "@/components/app/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface AiInterviewJoinCardProps {
  interviewId: string;
  status: string | null;
  meetingLink: string | null;
  updatedAt?: string | null;
}

export function AiInterviewJoinCard({
  status,
  meetingLink,
}: AiInterviewJoinCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const isWaiting = status === "waiting" || (!meetingLink && status !== "completed");
  const isScheduled = status === "scheduled" && Boolean(meetingLink);
  const isCompleted = status === "completed";

  const handleProceed = () => {
    if (!meetingLink || !agreed) return;
    window.open(meetingLink, "_blank", "noopener,noreferrer");
    setModalOpen(false);
  };

  return (
    <>
      <Surface className="overflow-hidden border-brand-200/80 bg-gradient-to-br from-white via-brand-50/20 to-brand-50/40 p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-xs">
              <Sparkles className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-ink-900">
                  AI Interview
                </h3>
              </div>
              <p className="mt-1 text-xs text-ink-600 leading-relaxed max-w-xl">
                Multi-modal technical assessment, behavioral screening, and proctored coding benchmark.
                Your performance determines your Findtern Score across communication, coding, aptitude, and interview axes.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {isWaiting && <Pill tone="waiting">Queue · Unlocking in 24–48h</Pill>}
            {isScheduled && <Pill tone="live">Ready to Start</Pill>}
            {isCompleted && <Pill tone="live">Completed</Pill>}
          </div>
        </div>

        {/* State-specific UI */}
        {isWaiting && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs text-amber-900">
            <Clock className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold text-amber-950">Application registered in scheduling queue</p>
              <p className="mt-0.5 text-amber-800 leading-normal">
                We are setting up your AI interview link. You will receive an instant notification
                here the moment your interview link is unlocked.
              </p>
            </div>
          </div>
        )}

        {isScheduled && (
          <div className="mt-5 pt-4 border-t border-brand-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-brand-900">
              <CheckCircle2 className="size-4 text-brand-700" />
              <span>Your AI interview link is ready.</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setAgreed(false);
                setModalOpen(true);
              }}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-xs font-semibold text-white shadow-xs hover:bg-brand-600"
            >
              <Video className="size-4" />
              <span>Join AI Interview</span>
            </button>
          </div>
        )}

      </Surface>

      {/* Instructions & Agreement Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink-900">
              <ShieldAlert className="size-5 text-brand-700" />
              <span>AI Interview: Instructions & Terms</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              Please review these requirements before you start the AI interview.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 space-y-2 text-brand-950">
              <p className="font-bold text-xs uppercase tracking-wider text-brand-900">
                Mandatory Test Guidelines:
              </p>
              <ol className="list-decimal pl-4 space-y-1.5 text-xs leading-relaxed text-brand-900">
                <li>
                  <strong>Quiet Environment & Stable Internet:</strong> Use a quiet room with good lighting and minimum 5 Mbps stable connection.
                </li>
                <li>
                  <strong>Microphone & Camera Enabled:</strong> Grant browser permissions for webcam and microphone when prompted.
                </li>
                <li>
                  <strong>No Tab Switching or Reloading:</strong> Proctored tracking detects window blur, page refreshes, and secondary screens.
                </li>
                <li>
                  <strong>Autonomous Evaluation:</strong> Your responses, code submissions, and communication will be scored automatically and published to your Findtern talent dossier.
                </li>
              </ol>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-ink-100 bg-ink-50/50 p-3">
              <input
                type="checkbox"
                id="ai-terms-agreed"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="ai-terms-agreed" className="text-xs font-medium text-ink-800 cursor-pointer">
                I have read the instructions and agree to proceed with the AI interview.
              </label>
            </div>

            {!agreed && (
              <p className="flex items-center gap-1.5 text-2xs text-text-subtle">
                <AlertCircle className="size-3 text-amber-600" />
                <span>You must accept the guidelines before proceeding.</span>
              </p>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!agreed || !meetingLink}
              onClick={handleProceed}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-600 disabled:opacity-50"
            >
              <ExternalLink className="size-3.5" />
              <span>Proceed to Interview</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
