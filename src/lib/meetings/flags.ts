import { FLAG_CODES, FLAG_RULES } from "./review-types.ts";
import type { Flag, FlagCode, TranscriptLine } from "./review-types.ts";

/**
 * Deterministic off-platform flags for a meeting transcript (Phase 3). Pure: no DB, no network, no clock.
 *
 * A flag is EVIDENCE for an admin to read, never a verdict: nothing here punishes anyone.
 * Precision over recall: ordinary talk (ages, CGPA, pincodes, stipends quoted "through Findtern", a bare "Instagram")
 * must not flag. Each rule only fires on an intent phrase or on a shape that is clearly contact or payment detail.
 * Rules look at ONE line at a time. Digits dictated across several lines ("nine eight seven" ... next line "six five") are
 * out of scope on purpose: joining lines would multiply false positives, and Fireflies keeps a spoken number in one sentence
 * almost always. Lines longer than MAX_LINE_CHARS are only scanned up to that point.
 */

/** Optional second pass (an LLM that re-reads a transcript and its flags). NOT implemented and NOT called anywhere. */
export interface LlmJudge {
  /**
   * Optional hook, NOT implemented, not called anywhere. Would receive the transcript and the deterministic flags and
   * return the flags to keep (it may only confirm or drop; any new flag must still carry a snippet from a line).
   */
  judge(lines: TranscriptLine[], flags: Flag[]): Promise<Flag[]>;
}

const MAX_FLAGS = 60;
const MAX_SNIPPET_CHARS = 200;
const CONTEXT_WORDS = 6;
const MAX_LINE_CHARS = 2000;

type Span = readonly [number, number];
type Finder = (text: string) => Span | null;
type Accept = (m: RegExpExecArray, text: string) => boolean;

const rx = (src: string) => new RegExp(src, "gi");

/** Earliest match over several patterns (optionally filtered by `accept`). */
function firstSpan(text: string, patterns: RegExp[], accept?: Accept): Span | null {
  let best: Span | null = null;
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      const at = m.index ?? 0;
      if (accept && !accept(m, text)) continue;
      if (!best || at < best[0]) best = [at, at + m[0].length];
      break;
    }
  }
  return best;
}

const earliest = (...spans: (Span | null)[]): Span | null => {
  let best: Span | null = null;
  for (const s of spans) if (s && (!best || s[0] < best[0])) best = s;
  return best;
};

// Shared pieces. ASR: "Find tern", "Fin tern" for Findtern.
const FT = String.raw`(?:find\s?tern|fin\s?tern|find\s+turn)`;
const PF = String.raw`(?:the\s+)?(?:platform|${FT})`;

// ---------------------------------------------------------------- phone_number

const isPhoneDigits = (d: string) => /^(?:[6-9]\d{9}|0[6-9]\d{9}|91[6-9]\d{9})$/.test(d);

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", shunya: "0",
  one: "1", ek: "1",
  two: "2", do: "2",
  three: "3", teen: "3",
  four: "4", char: "4", chaar: "4",
  five: "5", paanch: "5", panch: "5",
  six: "6", chhe: "6", chheh: "6", chhah: "6", chha: "6",
  seven: "7", saat: "7",
  eight: "8", aath: "8",
  nine: "9", nau: "9", nav: "9",
};

/** 10 digits starting 6-9 (optionally +91 / 91 / 0 in front), written with digits and spaces, dashes or dots between groups. */
function numericPhone(text: string): Span | null {
  const groups = [...text.matchAll(/\d+/g)];
  for (let a = 0; a < groups.length; a++) {
    const start = groups[a].index ?? 0;
    const lead = text.slice(0, start);
    if (/[a-z0-9]$/i.test(lead)) continue; // glued to a word or id, not a spoken number
    let digits = "";
    let prevEnd = start;
    for (let b = a; b < groups.length; b++) {
      const gs = groups[b].index ?? 0;
      if (b > a && !/^[ .-]{1,3}$/.test(text.slice(prevEnd, gs))) break;
      digits += groups[b][0];
      prevEnd = gs + groups[b][0].length;
      if (digits.length > 12) break;
      if (!isPhoneDigits(digits)) continue;
      const parts = groups.slice(a, b + 1).map((g) => g[0]);
      if (parts.length === 2 && parts.every((p) => p.endsWith("000"))) break; // "60000-70000": a pay range
      if (/(?:₹|\brs\.?|\binr|\brupees?)\s*$/i.test(lead)) break; // an amount
      const from = lead.endsWith("+") ? start - 1 : start;
      return [from, prevEnd];
    }
  }
  return null;
}

/** >= 8 spoken digit words ("nine eight double seven ...", "nau aath saat ...") that make a valid mobile number. */
function spokenPhone(text: string): Span | null {
  const toks = [...text.matchAll(/\S+/g)].map((m) => ({
    w: m[0].toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""),
    s: m.index ?? 0,
    e: (m.index ?? 0) + m[0].length,
  }));
  let i = 0;
  while (i < toks.length) {
    const units: { d: string; wc: number; s: number; e: number }[] = [];
    let j = i;
    while (j < toks.length) {
      const w = toks[j].w;
      const nextDigit = j + 1 < toks.length ? DIGIT_WORDS[toks[j + 1].w] : undefined;
      if ((w === "double" || w === "triple") && nextDigit !== undefined) {
        units.push({ d: nextDigit.repeat(w === "double" ? 2 : 3), wc: 2, s: toks[j].s, e: toks[j + 1].e });
        j += 2;
      } else if (DIGIT_WORDS[w] !== undefined) {
        units.push({ d: DIGIT_WORDS[w], wc: 1, s: toks[j].s, e: toks[j].e });
        j += 1;
      } else if (/^\d+$/.test(w)) {
        units.push({ d: w, wc: 0, s: toks[j].s, e: toks[j].e });
        j += 1;
      } else break;
    }
    if (units.length > 0) {
      // Allow up to two stray leading/trailing units ("do" in "please do nine eight ...").
      const n = units.length;
      for (let a = 0; a <= Math.min(2, n - 1); a++) {
        for (let b = n; b >= Math.max(a + 1, n - 2); b--) {
          const win = units.slice(a, b);
          if (win.reduce((t, u) => t + u.wc, 0) >= 8 && isPhoneDigits(win.map((u) => u.d).join(""))) {
            return [win[0].s, win[win.length - 1].e];
          }
        }
      }
      i = j;
    } else i++;
  }
  return null;
}

const findPhone: Finder = (text) => earliest(numericPhone(text), spokenPhone(text));

// ---------------------------------------------------------------- email_address

const MAIL_PROVIDER = String.raw`(?:gmail|yahoo|outlook|hotmail|rediffmail|rediff|proton(?:mail)?|icloud)`;
const MAIL_LOCAL = String.raw`[a-z0-9][a-z0-9_]*(?:\s+(?:dot|underscore|dash|hyphen)\s+[a-z0-9_]+)*`;
const MAIL_TLD = String.raw`(?:com|in|net|org|co(?:\s+dot\s+in)?)`;
/** First word of the spoken local part when it is just a normal word ("send it to me at gmail ..."). */
const NOT_A_LOCAL_PART = new Set(
  ("a an the me you it is am are was were be been i we he she they us them and or at to my your our his her their this that " +
    "there here for of on in with from just only mail email id address work works worked working look looks looking " +
    "sitting sat sit meet meeting logged login log signed sign open opened check checked see saw seen visit visited go going went").split(" "),
);
const localIsWord = (m: RegExpExecArray) => NOT_A_LOCAL_PART.has((m[0].split(/\s+/)[0] ?? "").toLowerCase());

const EMAIL_WRITTEN = rx(String.raw`\b[a-z0-9][a-z0-9._%+\-]*@((?:[a-z0-9\-]+\.)+[a-z]{2,})`);
const EMAIL_AT_SYMBOL = rx(String.raw`\b${MAIL_LOCAL}\s*@\s*${MAIL_PROVIDER}\b`);
const EMAIL_AT_RATE = rx(String.raw`\b${MAIL_LOCAL}\s+at\s+the\s+rate(?:\s+of)?\s+${MAIL_PROVIDER}\b`);
const EMAIL_AT_DOT = rx(String.raw`\b${MAIL_LOCAL}\s+at\s+${MAIL_PROVIDER}\s+dot\s+${MAIL_TLD}\b`);
const EMAIL_AT_BARE = rx(String.raw`\b${MAIL_LOCAL}\s+at\s+${MAIL_PROVIDER}\b`);

const findEmail: Finder = (text) =>
  earliest(
    firstSpan(text, [EMAIL_WRITTEN], (m) => !/(?:^|\.)findtern\./i.test(m[1] ?? "")),
    firstSpan(text, [EMAIL_AT_SYMBOL, EMAIL_AT_RATE]),
    firstSpan(text, [EMAIL_AT_DOT], (m) => !localIsWord(m)),
    // "rahul at gmail" with no ".com": only next to an email cue, else "look at Gmail" would flag.
    firstSpan(text, [EMAIL_AT_BARE], (m, t) => !localIsWord(m) && /\b(?:e-?mail|mail|id)\b/i.test(t.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0))),
  );

// ---------------------------------------------------------------- messaging_handle

const PLAT = String.raw`(?:what'?s\s?app|whatsapp|whatsap|watsapp|telegram|signal|instagram|insta|ig|snap\s?chat|snapchat)`;
/** Platforms whose bare name is not an everyday word ("signal", "snap" are). */
const PLAT_STRICT = String.raw`(?:what'?s\s?app|whatsapp|whatsap|watsapp|telegram|instagram|insta|ig|snap\s?chat|snapchat)`;

const MESSAGING = [
  String.raw`\b(?:message|msg|text|ping|dm|call|contact|reach|add|connect\s+with|find)\s+(?:me|us)\s+(?:on|at|via|over|in)\s+${PLAT}\b`,
  String.raw`\bdm\s+(?:me|us)\b`,
  String.raw`\b(?:my|mera|meri|apna|apni|aapka|aapki|tumhara|tumhari)\s+${PLAT_STRICT}\s+(?:is|hai|number|no\.?|id|handle|username|user\s?name)\b`,
  String.raw`\b${PLAT_STRICT}\s+me\b`,
  String.raw`\b${PLAT_STRICT}\s+(?:pe|par|kar|karo|karna|kardo)\b`,
  String.raw`\b${PLAT_STRICT}\s+(?:number|no\.?|num|id|handle|username)\b`,
  String.raw`\b(?:let'?s|lets|can\s+we|shall\s+we|should\s+we|we\s+can)\s+(?:\w+\s+){0,3}?(?:on|over|via)\s+${PLAT}\b`,
  String.raw`\b(?:send|share|give|drop|tell)\s+(?:me\s+)?(?:your|ur)\s+${PLAT_STRICT}\b`,
  String.raw`\bmy\s+handle\s+is\b`,
].map(rx);
const AT_HANDLE = rx(String.raw`(?<![\w.@/])@[a-z0-9_][a-z0-9_.]{2,}`);

const findMessaging: Finder = (text) =>
  earliest(firstSpan(text, MESSAGING), firstSpan(text, [AT_HANDLE], (m) => !/^@findtern/i.test(m[0])));

// ---------------------------------------------------------------- payment_handle

const UPI_DOMAIN = String.raw`(?:ok(?:axis|sbi|hdfcbank|icici|hdfc)|ybl|ibl|axl|apl|paytm|upi|sbi|axisbank|icici|hdfcbank|ptyes|pthdfc|ptaxis|ptsbi|fbl|postbank|freecharge)`;
const APP = String.raw`(?:g\s?pay|google\s?pay|gpay|phone\s?pay|phonepe|pay\s?tm|paytm)`;
/** After a payment verb "phone pe" is PhonePe; elsewhere it is the Hindi "on the phone". */
const APP_ALL = String.raw`(?:${APP}|phone\s?pe|bhim)`;
const PAY_VERB = String.raw`(?:send|sent|sending|transfer|transferring|pay|paying|payment|bhej\w*|de\s?do|dedo|dena|dunga)`;

const PAYMENT = [
  String.raw`\b[a-z0-9][a-z0-9._\-]+@${UPI_DOMAIN}(?![a-z0-9])(?!\.[a-z])`,
  String.raw`\b${MAIL_LOCAL}\s+(?:at\s+the\s+rate(?:\s+of)?|at|@)\s*(?:okaxis|oksbi|okhdfcbank|okicici|ybl|ibl|apl|axl)\b`,
  String.raw`\b${MAIL_LOCAL}\s+(?:at\s+the\s+rate(?:\s+of)?|@)\s*(?:paytm|upi|sbi)\b`,
  String.raw`\bupi\s*(?:id|i\s?d|i'd|handle|address|number|no\.?)\b`,
  String.raw`\bupi\s+(?:pe|par|kar\w*)\b`,
  String.raw`\b${APP}\s+(?:number|no\.?|num|id|details|account|handle)\b`,
  String.raw`\b${APP}\s+(?:pe|par|se|kar|karo|karna|kardo|karde|karenge|karunga|karungi|kr)\b`,
  String.raw`\b(?:my|mera|meri)\s+${APP}\s+(?:is|hai)\b`,
  String.raw`\b${PAY_VERB}\s+(?:\S+\s+){0,3}?(?:on|via|through|using|by|to)\s+${APP_ALL}\b`,
  String.raw`\bbank\s+account\s+(?:number|no\.?|details?|info)\b`,
  String.raw`\bifsc\b`,
].map(rx);
const ACCOUNT_DETAILS = rx(String.raw`\b(?:account|a/c)\s+(?:details|number|no\.?)\b`);
const SEND_CUE = /\b(?:send|share|give|provide|drop|need|want|bhej\w*|de\s?do|dedo|dena)\b/i;
const MONEY_CUE = /\b(?:pay\w*|paise|money|transfer\w*|stipend|salary|amount|credit\w*|rs|rupees?|bhej\w*)\b|₹/i;

const findPayment: Finder = (text) =>
  earliest(
    firstSpan(text, PAYMENT),
    // "send your account details" only counts when money is the topic too ("... so I can transfer the money").
    firstSpan(text, [ACCOUNT_DETAILS], (_m, t) => SEND_CUE.test(t) && MONEY_CUE.test(t)),
  );

// ---------------------------------------------------------------- direct_payment

const PAY_CTX = /\b(?:pay|paid|paying|payment|give|giving|stipend|salary|amount|dunga|denge|dena)\b/i;
const DIRECT = [
  String.raw`\bpay(?:ing)?\s+(?:you|me|him|her|them)\b(?:\s+\S+){0,5}?\s+directly\b`,
  String.raw`\bpay(?:ing)?\s+directly\b`,
  String.raw`\bdirectly\s+(?:to|in|into)\s+(?:my|your|his|her)\s+(?:bank\s+)?account\b`,
  String.raw`\b(?:outside|without|off)\s+(?:of\s+)?(?:the\s+)?(?:platform|${FT})\b`,
  String.raw`\boff[-\s]platform\b`,
  String.raw`\bcash\s+payments?\b`,
  String.raw`\bcash\s+(?:(?:me|mein|main)\s+)?(?:de\s?)?(?:dunga|dungi|dena|denge|do|dedo)\b`,
  String.raw`\bno\s+commission\b`,
  String.raw`\bcommission\s+(?:free|nahi|bachao|bachana|bachega)\b`,
  String.raw`\bsave\s+(?:on\s+)?(?:the\s+)?(?:platform|${FT})\s+(?:fees?|commission|charges?)\b`,
  String.raw`\bsave\s+(?:the\s+)?commission\b`,
  String.raw`\b(?:avoid|skip)\s+(?:the\s+)?(?:platform\s+)?(?:fees?|commission)\b`,
  String.raw`\bdirect\s+payment\b`,
  String.raw`\bseedha\s+(?:paise|payment|account|mere|apne|tumhare|aapke|de\b|dunga|denge|dena|bhej\w*|transfer)`,
  String.raw`\bplatform\s+ke\s+bahar\b(?:\s+\S+){0,3}?\s+(?:payment|paise|pay)\b`,
  String.raw`\bbahar\s+(?:se\s+)?(?:payment|paise)\b`,
].map(rx);
const GIVE_DIRECTLY = rx(String.raw`\b(?:give|giving|transfer|transferring|send|sending)\s+(?:you|me|him|her|them)\b(?:\s+\S+){0,6}?\s+directly\b`);
const IN_CASH = rx(String.raw`\bin\s+cash\b`);
const MONEY_IN_MATCH = /\d|rupee|\brs\b|₹|stipend|salary|money|amount|payment|lakh|thousand/i;

const findDirectPayment: Finder = (text) =>
  earliest(
    firstSpan(text, DIRECT),
    firstSpan(text, [GIVE_DIRECTLY], (m) => MONEY_IN_MATCH.test(m[0])),
    firstSpan(text, [IN_CASH], (_m, t) => PAY_CTX.test(t)),
  );

// ---------------------------------------------------------------- external_meeting_link

const MEETING_APP = String.raw`(?:zoom|teams|microsoft\s+teams|google\s+meet|skype|webex|whereby)`;
const EXTERNAL = [
  String.raw`\bzoom\.us(?:/\S*)?`,
  String.raw`\bteams\.microsoft\.com/l/meetup-join`,
  String.raw`\bteams\.live\.com/meet`,
  String.raw`\bmeet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}\b`,
  String.raw`\bwhereby\.com\b`,
  String.raw`\bwebex\.com\b`,
  String.raw`\b(?:zoom\s+dot\s+us|whereby\s+dot\s+com|meet\s+dot\s+google\s+dot\s+com)\b`,
  String.raw`\bjoin\s+(?:my|the|this|our|a)\s+(?:zoom|webex|skype)\b`,
  String.raw`\bjoin\s+(?:my|the|this|our)\s+teams\s+(?:meeting|call|link)\b`,
  String.raw`\b(?:zoom|teams|webex|skype)\s+(?:link|invite|id|meeting\s+id)\b`,
  String.raw`\b(?:zoom|skype|webex)\s+(?:pe|par)\b`,
  String.raw`\b(?:continue|move|switch|shift|connect|talk|speak|meet)\s+(?:\S+\s+){0,2}?(?:on|over|via|in|to)\s+${MEETING_APP}\b`,
].map(rx);
const findExternalLink: Finder = (text) => firstSpan(text, EXTERNAL);

// ---------------------------------------------------------------- skip_platform

const SKIP = [
  String.raw`\b(?:skip|bypass(?:ing)?|avoid|ditch)\s+(?:the\s+)?(?:whole\s+)?(?:platform|${FT})\b`,
  String.raw`\bgo(?:ing)?\s+around\s+(?:the\s+)?(?:platform|${FT})\b`,
  String.raw`\bwithout\s+(?:going\s+through|using|involving)\s+${PF}\b`,
  String.raw`\b(?:we|you|i)\s+(?:do\s*n'?t|do\s+not|dont)\s+(?:really\s+)?need\s+${PF}\b`,
  String.raw`\bno\s+need\s+(?:for|of)\s+${PF}\b`,
  String.raw`\btake\s+(?:this|it|that|things|the\s+conversation|the\s+discussion)\s+offline\b`,
  String.raw`\b(?:leave|quit)\s+${PF}\b`,
  String.raw`\bmove\s+(?:out\s+of|off)\s+${PF}\b`,
  String.raw`\b(?:don'?t|do\s+not|dont|never)\s+tell\s+(?:the\s+)?(?:platform|${FT})\b`,
  String.raw`\b(?:platform|${FT})\s+se\s+bahar\b`,
  String.raw`\b(?:platform|${FT})\s+ko\s+ch(?:h)?o[dr]\w*`,
  String.raw`\b(?:platform|${FT})\s+ke\s+bina\b`,
  String.raw`\b(?:platform|${FT})\s+ko\s+mat\s+bata\w*`,
  String.raw`\b(?:platform|${FT})\s+ki\s+(?:zarurat|zaroorat|jarurat|zaroorath)\s+(?:nahi|nahin|nhi)\b`,
  String.raw`\b(?:platform|${FT})\s+skip\s+kar\w*`,
].map(rx);
const findSkipPlatform: Finder = (text) => firstSpan(text, SKIP);

// ---------------------------------------------------------------- output

const FINDERS: Record<FlagCode, Finder> = {
  phone_number: findPhone,
  email_address: findEmail,
  messaging_handle: findMessaging,
  payment_handle: findPayment,
  direct_payment: findDirectPayment,
  external_meeting_link: findExternalLink,
  skip_platform: findSkipPlatform,
};

const normalize = (raw: string) => raw.slice(0, MAX_LINE_CHARS).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

/** The matched words with ~6 words of context each side (same line), "…" where trimmed, at most MAX_SNIPPET_CHARS. */
function makeSnippet(text: string, from: number, to: number): string {
  let start = from;
  let end = to;
  while (start > 0 && text[start - 1] !== " ") start--;
  while (end < text.length && text[end] !== " ") end++;
  const core = text.slice(start, end);
  const before = text.slice(0, start).split(" ").filter(Boolean);
  const after = text.slice(end).split(" ").filter(Boolean);
  for (let n = CONTEXT_WORDS; n >= 0; n--) {
    const b = before.slice(before.length - Math.min(n, before.length));
    const a = after.slice(0, n);
    const s = `${before.length > b.length ? "… " : ""}${[...b, core, ...a].join(" ")}${after.length > a.length ? " …" : ""}`;
    if (s.length <= MAX_SNIPPET_CHARS) return s;
  }
  return `${core.slice(0, MAX_SNIPPET_CHARS - 1)}…`;
}

/** Flags for one transcript: at most one per (line, rule), ordered by line index then rule, capped at 60. */
export function flagTranscript(lines: TranscriptLine[]): Flag[] {
  const ordered = [...lines].sort((a, b) => a.i - b.i);
  const out: Flag[] = [];
  const seen = new Set<string>();
  for (const line of ordered) {
    if (typeof line.t !== "string") continue;
    const text = normalize(line.t);
    if (!text) continue;
    for (const rule of FLAG_CODES) {
      const key = `${line.i}:${rule}`;
      if (seen.has(key)) continue;
      const span = FINDERS[rule](text);
      if (!span) continue;
      seen.add(key);
      out.push({
        rule,
        severity: FLAG_RULES[rule].severity,
        snippet: makeSnippet(text, span[0], span[1]),
        offsetSec: line.s,
        speaker: line.sp,
        line: line.i,
      });
      if (out.length >= MAX_FLAGS) return out;
    }
  }
  return out;
}
