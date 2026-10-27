"use client";

/**
 * Join a company meeting through the legacy "Important Instructions" gate
 * (no identity reveal, no off-platform contact, recorded; 10 s countdown).
 * Placeholder in the lead's branch; the offers/interviews branch owns the
 * full version of this file (INW-10).
 */

import { useState } from "react";
import { Video } from "lucide-react";

import { CountdownAgreement } from "@/components/app/countdown-agreement";
import { buttonClass } from "@/components/ui/button";

export function MeetingJoinButton({
  link,
  block,
  size = "md",
  label = "Join meeting",
}: {
  link: string;
  block?: boolean;
  size?: "sm" | "md";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ size, block })}>
        <Video className="size-4" aria-hidden />
        {label}
      </button>
      <CountdownAgreement
        open={open}
        onOpenChange={setOpen}
        title="Important instructions"
        sections={[
          {
            title: "Before you join",
            lines: [],
            bullets: [
              "Do not share your personal contact details or identity documents during the interview.",
              "Do not take the conversation off Findtern.",
              "The interview may be recorded. Breaking these rules voids your guarantee.",
            ],
          },
        ]}
        agreeLabel="I have read and agree to these instructions."
        confirmLabel="Join meeting"
        onConfirm={() => {
          window.open(link, "_blank", "noopener,noreferrer");
          setOpen(false);
        }}
      />
    </>
  );
}
