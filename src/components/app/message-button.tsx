"use client";

import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { StartThreadButton } from "@/components/messaging";
import { buttonClass } from "@/components/ui/button";

/**
 * Opens (or reuses) the one conversation with the other side of a proposal and
 * goes to it. The role comes from the console the button sits in
 * (/employer/... or /intern/...).
 */
export function MessageButton({
  counterpartId,
  proposalId,
  label = "Message",
}: {
  counterpartId: string;
  proposalId: string;
  label?: string;
}) {
  const role = usePathname()?.startsWith("/employer") ? "employer" : "intern";
  return (
    <StartThreadButton
      counterpartId={counterpartId}
      proposalId={proposalId}
      role={role}
      className={buttonClass({ variant: "outline", size: "md" })}
    >
      <MessageSquare aria-hidden className="size-4" />
      {label}
    </StartThreadButton>
  );
}
