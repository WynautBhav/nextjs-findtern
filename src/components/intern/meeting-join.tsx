"use client";

import { useState } from "react";
import { Video } from "lucide-react";

import { CountdownAgreement, type AgreementSection } from "@/components/app/countdown-agreement";
import { buttonClass } from "@/components/ui/button";

/**
 * Legacy interviews.tsx "Important Instructions" (meet gate), in substance:
 * shown before an intern joins a company meeting, with a 10 s read time and
 * no tick box, then "Accept & Join" opens the link (INW-10).
 */
const MEETING_RULES: AgreementSection[] = [
  {
    title: "Before you join",
    lines: [
      "Do not reveal personal or employer identity, seek off-platform contact, or violate Findtern meeting rules.",
      "This meeting is recorded and monitored. Any breach will immediately void your guaranteed internship and may result in penalties or blacklisting.",
    ],
  },
];

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass({ variant: "primary", size, block, className: "text-sm font-semibold" })}
      >
        <Video className="size-4" aria-hidden />
        {label}
      </button>
      <CountdownAgreement
        open={open}
        onOpenChange={setOpen}
        title="Important Instructions"
        description="Please read before joining."
        sections={MEETING_RULES}
        requireAgreement={false}
        confirmLabel="Accept & Join"
        onConfirm={() => {
          // Opened from the click itself, so popup blockers let it through.
          window.open(link, "_blank", "noopener,noreferrer");
          setOpen(false);
        }}
      />
    </>
  );
}
