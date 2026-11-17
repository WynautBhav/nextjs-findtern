"use client";

import { useState } from "react";
import { LifeBuoy } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";

/**
 * "Contact admin" for a taken-down project: the one thing the employer can still do about it. Sends the message to the
 * admin Messages inbox, tagged with the project and company (POST /api/employer/projects/[id]/contact-admin).
 */
export function ContactAdminButton({ projectId, projectName, variant = "primary", className = "" }: { projectId: string; projectName: string; variant?: "primary" | "ghost" | "outline"; className?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/employer/projects/${encodeURIComponent(projectId)}/contact-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(res.status === 429 ? "Too many messages. Try again in a while." : (body.error ?? "Could not send. Try again."));
      else setSent(true);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setSent(false); setError(null); }} className={buttonClass({ variant, size: "sm", className: `min-h-11 ${className}` })}>
        <LifeBuoy className="size-4" aria-hidden /> Contact admin
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contact admin about {projectName}</DialogTitle>
            <DialogDescription>Tell Findtern admin what you would like to resolve. They will reply by email.</DialogDescription>
          </DialogHeader>
          {sent ? (
            <p role="status" className="rounded-apple-md bg-brand-50 p-3 text-sm text-ink-900">Sent. Findtern admin will reply by email.</p>
          ) : (
            <div className="space-y-2">
              <label htmlFor={`contact-admin-${projectId}`} className="text-sm font-medium text-ink-900">What would you like to tell admin?</label>
              <textarea
                id={`contact-admin-${projectId}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                rows={5}
                required
                className="w-full rounded-apple-md border border-ink-200 bg-white p-3 text-sm"
              />
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass({ variant: "outline", size: "sm" })}>{sent ? "Close" : "Cancel"}</button>
            {!sent && (
              <button type="button" disabled={busy || text.trim().length === 0} onClick={() => void send()} className={buttonClass({ variant: "primary", size: "sm" })}>
                {busy ? "Sending…" : "Send to admin"}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
