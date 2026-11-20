/**
 * The gate's wording and constants. No Node imports, so the browser bundle (the countdown screen, the Join buttons) can use it.
 * Everything that checks or signs lives in gate.ts.
 */

/** Bump when the wording changes materially: everyone then sees the gate again. */
export const DISCLAIMER_VERSION = "2026-11-20.1";
export const GATE_SECONDS = 10;
export const DISCLAIMER = {
  title: "Before you join",
  intro: "This is a Findtern platform meeting. Please use it for the interview or work discussion about the project.",
  rules: [
    "Do not share personal contact details, such as a phone number, personal email or social handles.",
    "Do not move the conversation off Findtern.",
    "Do not ask for, or offer, any payment outside Findtern.",
  ],
  recorded: "This meeting is recorded and summarised by an AI notetaker (Fireflies) for quality and safety. The notetaker will appear as a participant.",
  consequence: "Sharing personal information or breaking these rules can lead to a warning. Repeated violations can lead to your account being put on hold.",
  agree: "By continuing you agree to these rules.",
} as const;

/** A stand-in for the Meet URL in props that reach the browser: the real link is only ever behind the gate redirect. */
export const MASKED_MEET_LINK = "https://meet.google.com/masked-by-findtern";
export const maskMeetingLink = (raw: string | null | undefined): string | null => (raw && raw.trim() ? MASKED_MEET_LINK : null);
