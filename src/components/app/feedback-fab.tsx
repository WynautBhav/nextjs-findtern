"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MessageCircleQuestion } from "lucide-react";

import { FileUpload } from "@/components/app/file-upload";
import { csrfFetch } from "@/lib/client-fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "bug", label: "Something's broken" },
  { value: "idea", label: "Idea" },
  { value: "question", label: "Question" },
] as const;

/**
 * Floating support entry. The legacy dashboards both had a report dialog
 * posting to /api/support/feedback; the route survived the rewrite with zero
 * UI calling it. One floating button per dashboard, above the mobile tab bar.
 */
export function FeedbackFab({ className, variant = "fab" }: { className?: string; variant?: "fab" | "link" }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("bug");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  // Legacy shape (DB-14): up to five images / PDFs and one short video.
  const [attachments, setAttachments] = useState<{ key: string; name: string }[]>([]);
  const [video, setVideo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || state === "sending") return;
    setState("sending");
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("message", message.trim());
      // The page the report came from, so the team can reproduce it.
      form.set("pageUrl", window.location.href);
      for (const a of attachments) form.append("attachmentKey", a.key);
      if (video) form.set("videoKey", video);
      const res = await csrfFetch("/api/support/feedback", { method: "POST", body: form });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  function close() {
    setOpen(false);
    // Reset for next time, after the close animation.
    window.setTimeout(() => {
      setState("idle");
      setMessage("");
      setKind("bug");
      setAttachments([]);
      setVideo(null);
    }, 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a problem or ask a question"
        title="Report a problem"
        className={cn(
          variant === "fab"
            ? "apple-spring apple-pressable fixed right-4 bottom-24 z-40 grid size-14 place-items-center rounded-full bg-brand-950 text-white shadow-[0_8px_24px_rgb(7_47_36/0.35)] ring-1 ring-white/15 lg:right-8 lg:bottom-8"
            : "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm text-on-dark-subtle hover:bg-white/6 hover:text-white",
          className,
        )}
      >
        <MessageCircleQuestion className={variant === "fab" ? "size-6" : "size-4"} aria-hidden />
        {variant === "link" ? "Report a problem" : null}
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent className="apple-admin max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold tracking-[-0.02em]">
              Report a problem
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Goes straight to the Findtern team triage queue.
            </DialogDescription>
          </DialogHeader>

          {state === "sent" ? (
            <div className="flex flex-col items-center px-2 py-8 text-center">
              <CheckCircle2 className="size-10 text-brand-600" aria-hidden />
              <p className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
                Received
              </p>
              <p className="mt-1 text-[14px] text-text-subtle">
                We read every report and reply where it helps.
              </p>
              <button
                type="button"
                onClick={close}
                className="apple-spring apple-pressable mt-5 inline-flex min-h-11 items-center rounded-[10px] bg-brand-700 px-5 text-[14px] font-semibold text-white hover:bg-brand-600"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 pt-2">
              <div role="radiogroup" aria-label="What is this about" className="grid grid-cols-3 gap-1 rounded-[10px] bg-ink-100 p-1">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={kind === k.value}
                    onClick={() => setKind(k.value)}
                    className={cn(
                      "apple-spring inline-flex min-h-11 items-center justify-center rounded-[8px] px-2 text-[13px] font-medium",
                      kind === k.value
                        ? "bg-white text-ink-900 shadow-xs"
                        : "text-ink-600 hover:text-ink-800",
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="feedback-message" className="block text-[13px] font-semibold text-ink-800">
                  What happened?
                </label>
                <textarea
                  id="feedback-message"
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="One or two lines is plenty - what you did, what you expected."
                  className="apple-spring mt-1.5 min-h-24 w-full rounded-[10px] border border-ink-200 bg-white p-3 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              {attachments.length ? (
                <ul className="space-y-1 text-sm text-ink-700">
                  {attachments.map((a) => (
                    <li key={a.key} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{a.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((list) => list.filter((x) => x.key !== a.key))}
                        className="shrink-0 text-xs font-medium text-ink-600 underline-offset-4 hover:underline"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {attachments.length < 5 ? (
                <FileUpload
                  key={attachments.length}
                  kind="support"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  label="Screenshot"
                  hint={`Optional. Up to 5 images or PDFs, 10 MB each${attachments.length ? ` (${5 - attachments.length} left)` : ""}.`}
                  onUploaded={(r) => setAttachments((list) => [...list, { key: r.key, name: r.name }].slice(0, 5))}
                />
              ) : null}
              <FileUpload
                kind="support"
                accept="video/mp4,video/webm,video/quicktime"
                label="Screen recording"
                noun="video"
                hint="Optional. One short video, up to 10 MB."
                onUploaded={(r) => setVideo(r.key)}
              />

              {state === "error" ? (
                <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger-soft p-3 text-[13px] font-medium text-danger">
                  That did not send. Check your connection and try again.
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center rounded-[10px] px-4 text-[14px] font-medium text-ink-700 hover:bg-ink-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={state === "sending" || !message.trim()}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-5 text-[14px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : null}
                  Send report
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
