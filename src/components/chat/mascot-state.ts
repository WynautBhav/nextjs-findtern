/** Chat state → mascot clip. Pure, so it can be unit-tested without a DOM. */

export type MascotState = "idle" | "greeting" | "thinking" | "searching" | "celebrating" | "typing" | "thanked" | "oops" | "bye" | "sleepy";
export type MascotClip = "idle" | "greet" | "think" | "search" | "eureka" | "typing" | "thumbs" | "oops" | "bye" | "sleepy";

const CLIP: Record<MascotState, MascotClip> = {
  idle: "idle",
  greeting: "greet",
  thinking: "think",
  searching: "search",
  celebrating: "eureka",
  typing: "typing",
  thanked: "thumbs",
  oops: "oops",
  bye: "bye",
  sleepy: "sleepy",
};

/** One-shot clips end by asking the owner to go back to idle; the rest loop. */
const ONE_SHOT: ReadonlySet<MascotClip> = new Set(["greet", "eureka", "thumbs", "oops", "bye"]);

export const clipFor = (state: MascotState): MascotClip => CLIP[state];
export const isOneShot = (clip: MascotClip): boolean => ONE_SHOT.has(clip);

const LOOKUP = /\b(find|search|look(?:ing)?\s*(?:up|for)|where|which|list|show me|compare|vs|versus|cost|price|pricing|how much)\b/i;

/** A message that reads like a lookup gets the magnifying-glass clip while the reply is pending. */
export const looksLikeLookup = (text: string): boolean => LOOKUP.test(text);

/** Mood while a request is pending. */
export const busyState = (text: string): MascotState => (looksLikeLookup(text) ? "searching" : "thinking");


/** A reply that is still pending after this long gets the typing clip instead of think/search. */
export const TYPING_AFTER_MS = 2500;
/** An open panel with no interaction for this long gets the sleepy loop. */
export const SLEEPY_AFTER_MS = 45_000;

const THANKS = /\b(thanks|thank you|thx|ty|great|awesome|perfect|cool)\b/i;
export const looksLikeThanks = (text: string): boolean => THANKS.test(text);

/** Mood after a successful reply: a thumbs-up for thanks beats the one-time first-reply cheer. */
export const replyState = (userText: string, firstReply: boolean): MascotState =>
  looksLikeThanks(userText) ? "thanked" : firstReply ? "celebrating" : "idle";
