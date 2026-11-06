/**
 * Contact details in free text (OA1, OA8). Listings refuse them (`findContact`);
 * messages hide them until the hire is paid (`scrubContact`). Tuned to catch the
 * usual ways people slip a number or handle past a filter ("98765 43210",
 * "a [at] b dot com", "wa.me/…", "insta: x_y") without flagging ordinary text
 * such as "3 months" or "Python 3.11". Pure, so it is unit tested.
 */

export type ContactKind = "phone" | "email" | "url" | "handle";

export const HIDDEN_UNTIL_HIRE = "[hidden until hire]";

const AT = String.raw`(?:@|\s*[\[({<]\s*at\s*[\])}>]\s*|\s+at\s+)`;
const DOT = String.raw`(?:\.|\s*[\[({<]\s*dot\s*[\])}>]\s*|\s+dot\s+)`;
const TLD = "com|in|org|net|co|io|me|dev|app|ai|xyz|info|biz|us|uk|link|ly|gg|tv|page|site|online|store|tech";

/** Order matters: emails before handles (an email has an "@"), links before bare domains. */
const OWN = /^(?:www\.)?(?:[a-z0-9-]+\.)*findtern\.(?:in|com)(?:\/|$)/i;
const NOT_DOMAIN = /^(?:asp|vb|ado)\.net$/i;

const PATTERNS: { kind: ContactKind; re: RegExp; skip?: (m: string) => boolean }[] = [
  { kind: "email", re: new RegExp(String.raw`[A-Za-z0-9._%+-]+${AT}[A-Za-z0-9-]+(?:${DOT}[A-Za-z0-9-]+)*${DOT}[A-Za-z]{2,}\b`, "gi") },
  { kind: "url", re: /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, skip: (m) => OWN.test(m.replace(/^https?:\/\//i, "")) },
  { kind: "url", re: /\b(?:wa\.me|t\.me|bit\.ly|tinyurl\.com|linktr\.ee)\/?[^\s<>"']*/gi },
  { kind: "url", re: new RegExp(String.raw`\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:${TLD})\b(?:\/[^\s<>"']*)?`, "gi"), skip: (m) => OWN.test(m) || NOT_DOMAIN.test(m) },
  // "instagram", "my insta id: x_y", "whatsapp me on", "telegram @x": the platform word plus a handle-looking token after it.
  {
    kind: "handle",
    re: /\b(?:instagram|insta|ig|whats\s?app|telegram|snapchat|discord|skype|facebook|fb|twitter|linkedin)\b(?:\s*(?:id|handle|username|user\s*name|no\.?|number))?(?:\s*[:=]\s*@?[A-Za-z0-9_.]+|\s+(?:is\s+)?@?(?=[A-Za-z0-9_.]*[0-9_.@])[A-Za-z0-9_.]+)/gi,
  },
  { kind: "handle", re: /(?<![\w.@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,29}[A-Za-z0-9_])?/g },
  // Ten or more digits once spaces, dots, dashes and brackets are ignored (+91-98765-43210, 98765 43210).
  {
    kind: "phone",
    re: /(?<![\w₹$])\+?\d(?:[\s().,\/_-]{0,3}\d){9,14}(?![\w])/g,
    // only mobile-shaped runs; stipend ranges like 20000-25000, ISBNs and account numbers stay
    skip: (m) => {
      const d = m.replace(/\D/g, "");
      const mobile = /^(?:91|0)?[6-9]\d{9}$/.test(d) || (m.trim().startsWith("+") && d.length >= 11);
      const range = /^\s*\d[\d,]*000\s*[-–\/]\s*\d[\d,]*000\s*$/.test(m);
      return !mobile || range;
    },
  },
];

export function findContact(text: string): { kinds: ContactKind[] } {
  const kinds = new Set<ContactKind>();
  let rest = String(text ?? "");
  for (const { kind, re, skip } of PATTERNS) {
    rest = rest.replace(re, (m) => {
      if (skip?.(m)) return m;
      kinds.add(kind);
      return " ";
    });
  }
  return { kinds: [...kinds] };
}

export function scrubContact(text: string): { text: string; redacted: boolean } {
  let out = String(text ?? "");
  let redacted = false;
  for (const { re, skip } of PATTERNS) {
    out = out.replace(re, (m) => {
      if (skip?.(m)) return m;
      redacted = true;
      return HIDDEN_UNTIL_HIRE;
    });
  }
  return { text: out, redacted };
}
