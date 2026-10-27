"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {}
      }}
      className={cn(
        "apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3.5 text-[14px] font-medium",
        done ? "bg-brand-50 text-brand-800" : "bg-brand-700 text-white hover:bg-brand-600",
      )}
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

/**
 * The drive link, shown once. Only its hash is stored, so if the officer
 * loses it they issue a new one (the old one stops working).
 */
export function ShareLink({
  url,
  collegeName,
  driveTitle,
  startsAt,
  endsAt,
  kind,
}: {
  url: string;
  collegeName: string;
  driveTitle: string;
  startsAt: string;
  endsAt: string;
  kind: string;
}) {
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  const message = [
    `Dear hiring team,`,
    ``,
    `${collegeName} is running a virtual placement drive on Findtern: "${driveTitle}" (${kind === "full_time" ? "full-time roles" : "internships"}).`,
    `It is open from ${fmt(startsAt)} to ${fmt(endsAt)}.`,
    ``,
    `Every student in the drive has taken Findtern's AI interview, so you can filter by score, CGPA, branch and skills, shortlist, and call students on video right away.`,
    ``,
    `Join here (sign in or create a free employer account): ${url}`,
    ``,
    `Training & Placement Cell, ${collegeName}`,
  ].join("\n");

  return (
    <div className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5">
      <div>
        <h3 className="text-[15px] font-semibold text-ink-900">Your drive link</h3>
        <p className="mt-0.5 text-[13px] text-ink-700">
          Copy it now: for security Findtern doesn&apos;t keep a readable copy. Lost it? Issue a new link from the drive page.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={url}
          aria-label="Drive link"
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-ink-200 bg-white px-3 font-mono text-[13px] text-ink-800"
        />
        <CopyButton text={url} label="Copy link" />
      </div>
      <details className="group">
        <summary className="cursor-pointer text-[14px] font-medium text-brand-800">Invitation message for employers</summary>
        <pre tabIndex={0} aria-label="Invitation message" className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] border border-ink-200 bg-white p-3 font-sans text-[13px] leading-relaxed text-ink-800">
          {message}
        </pre>
        <div className="mt-2">
          <CopyButton text={message} label="Copy message" />
        </div>
      </details>
    </div>
  );
}
