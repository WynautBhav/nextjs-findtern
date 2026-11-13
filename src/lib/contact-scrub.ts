/**
 * Contact details in free text (OA1, OA8). Before a hire is paid, nothing that
 * lets the two sides reach each other off Findtern may pass: messages,
 * proposals and listings refuse it (`findContact`), and anything already
 * stored is hidden on read (`scrubContact`).
 *
 * Detection runs on a normalised copy so the usual dodges don't work: Unicode
 * look-alikes (fullwidth ＠ ．, Devanagari or other script digits), invisible
 * characters inside a number, spelled-out digits ("nine eight seven…", "ek do
 * teen…"), odd separators ("98765 -- 43210"), "name at gmail", "site . com".
 * Digits spelled out with other words mixed in can still beat any filter; that
 * is why sending refuses instead of masking part of a message.
 */

export type ContactKind = "phone" | "email" | "url" | "handle";

export const HIDDEN_UNTIL_HIRE = "[hidden until hire]";
export const CONTACT_REFUSED =
  "Phone numbers, emails, links and social handles can be shared only after the hire is paid. Remove them and send again.";
export const HIDDEN_MESSAGE = "[Message hidden: it contained contact details, which can be shared only after the hire is paid.]";

/* ── normalisation ─────────────────────────────────────────────────────── */

// First code point of each script's 0-9 run (fullwidth and maths digits are folded by NFKC first).
const DIGIT_ZEROS = [0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x17e0, 0x1810];
function toAsciiDigit(ch: string): string {
  const cp = ch.codePointAt(0)!;
  for (const z of DIGIT_ZEROS) if (cp >= z && cp <= z + 9) return String(cp - z);
  return "0";
}
const WORD_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  shunya: "0", sunya: "0", ek: "1", do: "2", teen: "3", char: "4", chaar: "4", paanch: "5", panch: "5", chhe: "6", chhah: "6",
  saat: "7", aath: "8", nau: "9",
};
const WORDS = Object.keys(WORD_DIGITS).join("|");
const TOKEN = String.raw`(?:(?:double|triple)\s+)?(?:${WORDS}|\d)`;
// Spelled-out digits only count inside a run of four or more, so "do the work" or "one month" stay text.
const DIGIT_RUN = new RegExp(String.raw`\b${TOKEN}(?:[\s,.\-/]+${TOKEN}){3,}\b`, "gi");
const DIGIT_WORD = new RegExp(String.raw`\b(?:(double|triple)\s+)?(${WORDS})\b`, "gi");

/** The copy every pattern runs on. */
export function normalizeForDetection(text: string): string {
  const s = String(text ?? "")
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\p{Nd}/gu, (d) => (d >= "0" && d <= "9" ? d : toAsciiDigit(d)))
    .replace(/[\u2010-\u2015\u2212]/g, "-");
  return s
    .replace(DIGIT_RUN, (run) =>
      run.replace(DIGIT_WORD, (_w, mult: string | undefined, word: string) =>
        WORD_DIGITS[word.toLowerCase()].repeat(!mult ? 1 : mult.toLowerCase() === "double" ? 2 : 3),
      ),
    )
    // "r a h u l @ g m a i l . c o m": four or more single characters in a row are one word.
    .replace(/(?<!\S)(?:\S[^\S\n]+){3,}\S(?!\S)/g, (run) => run.replace(/\s+/g, ""));
}

/* ── patterns (run on the normalised copy) ─────────────────────────────── */

const AT = String.raw`(?:@|\s*[\[({<]\s*at\s*[\])}>]\s*|\s+at\s+(?:the\s+rate\s+(?:of\s+)?)?)`;
const DOT = String.raw`(?:\.|\s*[\[({<]\s*dot\s*[\])}>]\s*|\s+dot\s+)`;
const TLD = "com|in|org|net|co|io|me|dev|app|ai|xyz|info|biz|us|uk|link|ly|gg|tv|page|site|online|store|tech";
const MAIL_HOSTS = "gmail|googlemail|yahoo|ymail|outlook|hotmail|live|rediffmail|rediff|icloud|protonmail|proton|zoho|aol";
const PLATFORMS = String.raw`instagram|insta|ig|whats\s?app|watsapp|telegram|snapchat|discord|skype|facebook|fb|twitter|linkedin|signal|wechat`;
// Words that commonly follow a platform name in ordinary text ("the fb page", "IG reels", "signal processing").
const AFTER_PLATFORM_OK = new Set(
  ("page pages reels reel post posts story stories ad ads account accounts profile group groups bot bots link links chat chats the a an and or is are for to on at it its " +
    "too also me us bio feed live marketing campaign campaigns content handle handles api apps app processing judgement integration integrations analytics clone ui sdk login auth").split(" "),
);
const OWN = /^(?:www\.)?(?:[a-z0-9-]+\.)*findtern\.(?:in|com)(?:\/|$)/i;
// ".NET" products, and degree names ("B.Tech", "B.Com", "M.Com", "B.Tech/M.Tech", "B.Tech/B.E") that end in a top-level domain.
const NOT_DOMAIN = /^(?:asp|vb|ado)\.net$|^[bm]\.(?:com|tech)(?:\/[a-z](?:\.[a-z]{1,4})+\.?)*$/i;

function isMobileRun(m: string): boolean {
  const d = m.replace(/\D/g, "");
  const mobile = /^(?:91|0)?[6-9]\d{9}$/.test(d) || (m.trim().startsWith("+") && d.length >= 11);
  const range = /^\s*\d[\d,]*000\s*[-–/]\s*\d[\d,]*000\s*$/.test(m);
  return mobile && !range;
}

/** Order matters: phones first (so "WhatsApp 98765 43210" is one hit), emails before handles, links before bare domains. */
const PATTERNS: { kind: ContactKind; re: RegExp; skip?: (m: string) => boolean }[] = [
  // Ten-plus digits with up to eight non-letter characters between each (spaces, dots, dashes, brackets, emoji…).
  { kind: "phone", re: /(?<![\p{L}\d₹$])\+?\d(?:[^\p{L}\d]{0,8}\d){9,14}(?![\p{L}\d])/gu, skip: (m) => !isMobileRun(m) },
  { kind: "email", re: new RegExp(String.raw`[A-Za-z0-9._%+-]+${AT}[A-Za-z0-9-]+(?:${DOT}[A-Za-z0-9-]+)*${DOT}[A-Za-z]{2,}\b`, "gi") },
  // "rahul.s99 at gmail", "rahul @ yahoo": a mail host with no top-level domain.
  { kind: "email", re: new RegExp(String.raw`[A-Za-z0-9._%+-]{2,}\s*(?:@|[\[({<]\s*at\s*[\])}>]|\bat(?:\s+the\s+rate(?:\s+of)?)?\b)\s*(?:${MAIL_HOSTS})\b`, "gi") },
  // "r4hul@gm4il", "a.b@host": letters on both sides of a bare @ (but "500@hour" stays text).
  { kind: "email", re: /[\w.%+-]+@[\w.-]+/g, skip: (m) => !/[A-Za-z][^@]*@.*[A-Za-z]/.test(m) },
  { kind: "email", re: new RegExp(String.raw`\b(?:${MAIL_HOSTS})\s+(?:com|co|in)\b`, "gi") },
  // "my number is in my bio": a pointer to contact details kept elsewhere.
  { kind: "handle", re: /\b(?:number|no|contacts?|details|e-?mail|mail|id|handle|phone)\b[^.\n]{0,25}?\b(?:in|on)\s+my\s+(?:bio|profile|resume|cv)\b/gi },
  { kind: "url", re: /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, skip: (m) => OWN.test(m.replace(/^https?:\/\//i, "")) },
  // "t me rahul", "wa me 9198…": the shortcut with the dot left out (not "don't me").
  { kind: "url", re: /(?<!['’])\b(?:wa|t)\s+me\s*\/?\s*@?[A-Za-z0-9_]{3,}/gi },
  { kind: "url", re: /\b(?:wa|t|bit|tinyurl|linktr|instagr|lnkd)\s*\.\s*(?:me|ly|com|ee|am|in)\s*\/\s*[^\s<>"']*/gi },
  { kind: "url", re: new RegExp(String.raw`\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:${TLD})\b(?:\/[^\s<>"']*)?`, "gi"), skip: (m) => OWN.test(m) || NOT_DOMAIN.test(m) },
  // "evil . com", "site dot in": spaced dots only with a lower-case TLD, so "Python dev. In 2024" stays text.
  { kind: "url", re: new RegExp(String.raw`\b[A-Za-z0-9-]{3,}(?:\s+\.\s*|\s*\.\s+|\s+dot\s+)(?:${TLD})\b(?!\s*[A-Za-z])`, "g"), skip: (m) => /findtern/i.test(m) },
  // Platform word, any separator, then a handle: "insta rahulsharma", "ig - x_y", "telegram: @abc".
  {
    kind: "handle",
    re: new RegExp(String.raw`\b(?:${PLATFORMS})\b(?:[^\p{L}\d@]{0,4}(?:id|handle|username|user\s*name|no\.?|number|is)){0,2}[^\p{L}\d@\n]{0,4}@?[A-Za-z0-9_.]{2,30}`, "giu"),
    skip: (m) => {
      const last = (m.match(/@?([A-Za-z0-9_.]{2,30})$/)?.[1] ?? "").toLowerCase().replace(/\.$/, "");
      return !m.includes("@") && AFTER_PLATFORM_OK.has(last);
    },
  },
  { kind: "handle", re: /(?<![\w.@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,29}[A-Za-z0-9_])?/g },
];

const YEAR = /^(?:19|20)\d\d$/;
/**
 * "98765 then 43210", "starts 987 … ends 3210": up to four groups of 3+ digits,
 * a few words apart, that together make a mobile number. Two round groups
 * ("75000 to 90000") are a range and years are dates, not halves of a number.
 */
function splitMobile(s: string): boolean {
  const groups = [...s.matchAll(/\d{3,}/g)].filter((g) => !YEAR.test(g[0]));
  for (let i = 0; i < groups.length; i++) {
    let digits = "";
    let round = 0;
    for (let j = i; j < Math.min(i + 4, groups.length) && digits.length <= 12; j++) {
      if (j > i && groups[j].index! - (groups[j - 1].index! + groups[j - 1][0].length) > 40) break;
      digits += groups[j][0];
      if (groups[j][0].endsWith("000")) round++;
      if (j > i && round < 2 && /^(?:91|0)?[6-9]\d{9}$/.test(digits)) return true;
    }
  }
  return false;
}

// shortcut: base64 is decoded one level only; double-encoding or other ciphers still pass, which is why sends are refused, not masked.
function decodedBase64(s: string): string[] {
  const out: string[] = [];
  for (const [tok] of s.matchAll(/[A-Za-z0-9+/]{16,}={0,2}/g)) {
    try {
      const d = atob(tok);
      if (/^[\x20-\x7e]+$/.test(d)) out.push(d);
    } catch {
      /* not base64 */
    }
  }
  return out;
}

export function findContact(text: string, depth = 0): { kinds: ContactKind[] } {
  const kinds = new Set<ContactKind>();
  let rest = normalizeForDetection(text);
  for (const { kind, re, skip } of PATTERNS) {
    rest = rest.replace(re, (m) => {
      if (skip?.(m)) return m;
      kinds.add(kind);
      return " ";
    });
  }
  if (splitMobile(rest)) kinds.add("phone");
  if (depth === 0) for (const d of decodedBase64(rest)) for (const k of findContact(d, 1).kinds) kinds.add(k);
  return { kinds: [...kinds] };
}

/** Error for the first public text field (or array of strings) that carries contact details, or null. */
export function contactFieldError(fields: Record<string, unknown>, where: string): string | null {
  for (const v of Object.values(fields)) {
    const values = Array.isArray(v) ? v : [v];
    if (values.some((x) => typeof x === "string" && findContact(x).kinds.length > 0)) {
      return `Remove the phone number / email / link / social handle from ${where}: contact details can be shared only after the hire is paid.`;
    }
  }
  return null;
}

/**
 * Read-side backstop for structured profile text (lists, nested rows): every
 * string carrying a contact detail becomes HIDDEN_UNTIL_HIRE. `keep` exempts
 * known-safe values such as catalog skills that look like domains ("Socket.io").
 */
export function hideContactText<T>(value: T, keep?: (s: string) => boolean): T {
  if (typeof value === "string") return (findContact(value).kinds.length > 0 && !keep?.(value) ? HIDDEN_UNTIL_HIRE : value) as T;
  if (Array.isArray(value)) return value.map((v) => hideContactText(v, keep)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hideContactText(v, keep)])) as T;
  }
  return value;
}

/**
 * Read-side backstop for text stored before these rules or under an older
 * filter: while contact is locked, a message with any contact detail is hidden whole.
 */
export function scrubContact(text: string): { text: string; redacted: boolean } {
  const value = String(text ?? "");
  return findContact(value).kinds.length > 0 ? { text: HIDDEN_MESSAGE, redacted: true } : { text: value, redacted: false };
}

/* ── outgoing chat messages (row 10) ───────────────────────────────────── */

export const NAME_MASK = "[name removed]";
export const CONTACT_MASK = "[contact details removed]";
export const OUTGOING_HIDDEN =
  "[Message removed: it contained contact details or names, which can be shared only after the hire is paid.]";
export const SCRUBBED_NOTICE =
  "We removed contact details or names from your message. They can be shared only after the hire is paid.";

const LEGAL_SUFFIXES = new Set(["pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated", "corp", "corporation", "co", "company", "opc", "plc", "gmbh", "the"]);

const foldName = (s: string): string =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const nameTokens = (s: string): string[] => foldName(s).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);

// Words in a company name that say what it does, not who it is, plus first names that are also plain English.
const GENERIC_COMPANY_WORDS = new Set(
  ("technologies technology tech solutions labs lab systems system services service software group consulting consultancy global india digital infotech enterprises enterprise industries " +
    "ventures studio studios works innovations networks media design agency partners holdings international web cloud data analytics").split(" "),
);
const COMMON_ENGLISH_NAMES = new Set(
  "will mark may grant hope rose dawn bill chase joy sunny river art pat ray rob sam max jack july april june faith summer".split(" "),
);

/**
 * Names that must not pass between the two sides before the hire is paid:
 * the company (full name and the name without "Pvt Ltd"), every contact name
 * of the employer, and the intern's first and last name. Whole phrases of any
 * length, single words of three letters or more.
 */
export function denyTermsFor(input: { company?: string | null; employerNames?: (string | null | undefined)[]; internFirst?: string | null; internLast?: string | null }): string[] {
  const out = new Set<string>();
  const phrase = (s: string | null | undefined) => {
    const f = foldName(s ?? "");
    if (f.length >= 3) out.add(f);
  };
  const person = (s: string | null | undefined) => {
    if (!COMMON_ENGLISH_NAMES.has(foldName(s ?? ""))) phrase(s);
    for (const t of nameTokens(s ?? "")) if (!COMMON_ENGLISH_NAMES.has(t)) out.add(t);
  };
  phrase(input.company);
  const coreWords = foldName(input.company ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !LEGAL_SUFFIXES.has(w));
  if (coreWords.join(" ").length >= 3) out.add(coreWords.join(" "));
  // The distinctive word of a multi-word name on its own ("Acme" of "Acme Technologies").
  for (const w of coreWords) if (w.length >= 4 && !GENERIC_COMPANY_WORDS.has(w)) out.add(w);
  for (const n of input.employerNames ?? []) person(n);
  person(input.internFirst);
  person(input.internLast);
  person(`${input.internFirst ?? ""} ${input.internLast ?? ""}`);
  return [...out];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function denyRegex(terms: string[]): RegExp | null {
  const parts = terms.filter((t) => t.length >= 3).sort((a, b) => b.length - a.length).map((t) => escapeRe(t).replace(/\s+/g, "\\s+"));
  return parts.length ? new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${parts.join("|")})(?![\p{L}\p{N}])`, "giu") : null;
}

/** True when the text mentions a denied name, however it is cased, accented or spaced out ("r a h u l"). */
export function hasDeniedName(text: string, terms: string[]): boolean {
  const re = denyRegex(terms);
  if (!re) return false;
  const folded = foldName(normalizeForDetection(text)).replace(/\p{Cf}/gu, "");
  if (re.test(folded)) return true;
  // "R a h u l", "r.a.h.u.l": a deliberately spelled-out run is squashed and compared as one word.
  const squashed = terms.map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter((t) => t.length >= 4);
  for (const run of String(text ?? "").normalize("NFKC").matchAll(/(?<![\p{L}\p{N}])(?:[\p{L}\p{N}][\s.\-_*]+){3,}[\p{L}\p{N}](?![\p{L}\p{N}])/gu)) {
    const flat = foldName(run[0]).replace(/[^\p{L}\p{N}]/gu, "");
    if (squashed.some((t) => flat.includes(t))) return true;
  }
  return false;
}

/**
 * What a chat message becomes before it is stored while contact is locked.
 * Denied names are masked in place. Then each sentence or line that still
 * carries a contact detail (or a name only the normalised copy exposes) is
 * replaced on its own, so the rest of the message survives. If the whole
 * message still trips the detector (digits split across sentences), all of it
 * is replaced. The result never carries what the detector would flag.
 */
export function scrubOutgoing(body: string, terms: string[]): { text: string; changed: boolean; kinds: ContactKind[]; names: boolean } {
  const original = String(body ?? "");
  const kinds = new Set<ContactKind>(findContact(original).kinds);
  const re = denyRegex(terms);
  let names = false;
  let text = original;
  if (re) {
    text = text.replace(re, () => {
      names = true;
      return NAME_MASK;
    });
  }
  const bad = (s: string) => findContact(s).kinds.length > 0 || hasDeniedName(s, terms);
  text = text
    .split(/(\n+|(?<=[.!?])\s+)/)
    .map((part, i) => {
      if (i % 2 === 1 || !part.trim() || !bad(part)) return part;
      for (const k of findContact(part).kinds) kinds.add(k);
      if (findContact(part).kinds.length === 0) names = true;
      return findContact(part).kinds.length > 0 ? CONTACT_MASK : NAME_MASK;
    })
    .join("");
  if (bad(text)) text = OUTGOING_HIDDEN;
  return { text, changed: text !== original, kinds: [...kinds], names };
}
