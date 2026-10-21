/**
 * Rich text sanitiser and renderer.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 *
 * Every one of the 23 published posts was pasted out of Google Docs, so the
 * stored `body` is a 37 KB blob of inline-styled HTML: a wrapping
 * `<span id="docs-internal-guid-…">`, `dir="ltr"`, `font-family: Arial`,
 * `font-size: 12pt`, `background-color: transparent` and nested `<span>`s
 * around every word. Rendered as-is, an article appears in 12pt Arial inside
 * a Poppins design system and looks like a document someone exported by
 * accident.
 *
 * The legacy build dealt with this in BlogDetail.tsx with a hand-rolled
 * regex that removed `<script>`, `<style>`, `on*=` handlers and
 * `javascript:` URLs. That is not a sanitiser - it is a list of four things
 * to remove, and anything not on the list (svg, iframe, srcset, formaction,
 * `<base>`, `data:` URLs, CSS `expression()`) passes straight through into
 * `dangerouslySetInnerHTML`. This replaces it.
 *
 * The approach is allowlist, not blocklist: anything not explicitly permitted
 * is dropped, so a new injection vector is inert by default rather than
 * dangerous until someone remembers to block it.
 */

/** Tags that survive, mapped to the class applied after rendering. */
const ALLOWED: Record<string, string | undefined> = {
  h2: "rt-h2",
  h3: "rt-h3",
  h4: "rt-h4",
  p: "rt-p",
  ul: "rt-ul",
  ol: "rt-ol",
  li: "rt-li",
  strong: "rt-strong",
  b: "rt-strong",
  em: "rt-em",
  i: "rt-em",
  a: "rt-a",
  blockquote: "rt-quote",
  hr: "rt-hr",
  br: undefined,
  code: "rt-code",
  pre: "rt-pre",
  sup: "rt-sup",
  sub: "rt-sub",
};

/** Tags whose entire contents are discarded, not just the tag. */
const VOID_CONTENT = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "template",
  "head",
  "link",
  "meta",
  "base",
  "title",
]);

/** Only href survives, and only when it is a safe scheme. */
const SAFE_HREF = /^(https?:\/\/|mailto:|#|\/)/i;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sanitise a stored rich-text body.
 *
 * Exported separately from the component so it can be unit-tested against a
 * payload list, and so the rules are readable without React in the way.
 */
export function sanitizeRichText(input: string): string {
  if (!input) return "";

  // 1. Drop the containers whose contents must not survive.
  let out = input;
  for (const tag of VOID_CONTENT) {
    out = out.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"),
      "",
    );
    // Also the self-closing / unclosed form.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
    out = out.replace(new RegExp(`<\\/${tag}\\s*>`, "gi"), "");
  }

  // 2. Google Docs wrapper and comment cruft. Removing the guid span wrapper
  //    is what stops the whole article inheriting an inline direction and
  //    background.
  out = out.replace(/<span[^>]*id="docs-internal-guid-[^"]*"[^>]*>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  // Docs spacer blocks: a `<div>` holding nothing but a `<br>` (often inside
  // an empty span). Unwrapped, each one leaves a bare line break between a
  // heading and its list.
  out = out.replace(/<div\b[^>]*>(?:\s|<span\b[^>]*>|<\/span>|<br\s*\/?>)*<\/div\s*>/gi, "");

  // 3. Walk every remaining tag. Anything unrecognised is unwrapped - its
  //    children are kept, the tag itself is discarded - so content survives
  //    even when its wrapper does not.
  out = out.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (match, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!(tag in ALLOWED)) return "";

      if (match.startsWith("</")) return `</${tag}>`;

      const cls = ALLOWED[tag];
      const classAttr = cls ? ` class="${cls}"` : "";

      if (tag === "a") {
        const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
        const raw = href ? (href[2] ?? href[3] ?? "") : "";
        if (!raw || !SAFE_HREF.test(raw.trim())) {
          return `<a${classAttr}>`;
        }
        const external = /^https?:/i.test(raw.trim());
        return `<a${classAttr} href="${escapeAttr(raw.trim())}"${
          external ? ' target="_blank" rel="noopener noreferrer"' : ""
        }>`;
      }

      return `<${tag}${classAttr}>`;
    },
  );

  // 3a. An address pasted as a link without its href (Docs smart chips do
  //     this) renders as a link that goes nowhere. Give it its mailto.
  out = out.replace(
    /<a class="rt-a">\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\s*<\/a>/g,
    (_m, email: string) => `<a class="rt-a" href="mailto:${escapeAttr(email)}">${email}</a>`,
  );

  // 3b. An `<li>` opened directly inside another `<li>` (no list between
  //     them). Docs pastes a styled wrapper bullet around the real items, so
  //     the browser renders one empty bullet and a lopsided indent. The
  //     wrapper is unwrapped and its children become ordinary items.
  out = unwrapNestedListItems(out);

  // 4. Demote headings that are not headings.
  //
  //    Google Docs "Heading 3" is the default style a writer applies to
  //    emphasised body copy, and every one of these posts was pasted from a
  //    Doc. Intern-10 arrives with 42 <h3> and 6 <h4> - the h3s are ordinary
  //    paragraphs, the h4s are the real sections, so the hierarchy is not just
  //    flat but inverted. Left alone it renders 42 bold 20px lines of running
  //    text and produces a 48-entry table of contents.
  //
  //    A heading is short and does not end like a sentence. Anything longer
  //    than MAX_HEADING_CHARS, or ending in sentence punctuation, is body copy
  //    wearing a heading tag, and becomes a paragraph. A "heading" that wraps
  //    whole blocks (the live intern NDA puts its entire clause list inside
  //    one <h3>) is unwrapped instead: a <p> around a list is invalid, and
  //    the browser would split it into stray empty paragraphs.
  out = out.replace(
    /<h([234]) class="rt-h[234]">([\s\S]*?)<\/h\1>/gi,
    (match, _level: string, inner: string) => {
      if (/<(?:p|ul|ol|li|blockquote|pre|h[234])\b/i.test(inner)) return inner;
      const text = inner.replace(/<[^>]*>/g, "").trim();
      const looksLikeProse =
        text.length > MAX_HEADING_CHARS || /[.!?,;]$/.test(text);
      return looksLikeProse ? `<p class="rt-p">${inner}</p>` : match;
    },
  );

  //    Surviving headings are re-levelled so the document starts at h2: the
  //    h3/h4 mix from Docs becomes a clean h2/h3 outline. Only when there is
  //    no h2 already - lifting unconditionally turned "2.1" sub-clauses and
  //    "For Interns" sub-heads in the legal documents into h2s, level with
  //    the clauses they belong to.
  const levels = [...out.matchAll(/<h([234]) class="rt-h[234]">/g)].map((m) => Number(m[1]));
  const shift = levels.length ? Math.min(...levels) - 2 : 0;
  if (shift > 0) {
    out = out.replace(
      /<(\/?)h([234])( class="rt-h[234]")?>/g,
      (_m, close: string, level: string, cls?: string) => {
        const lifted = Number(level) - shift;
        return close ? `</h${lifted}>` : `<h${lifted}${cls ? ` class="rt-h${lifted}"` : ""}>`;
      },
    );
  }

  // 5. Collapse the whitespace left behind by unwrapping.
  out = out.replace(/(^|[^<])\s{2,}/g, "$1 ");
  // Docs pads paragraph and item ends with <br><br> for spacing; the
  // stylesheet already spaces blocks, so trailing breaks only add gaps.
  out = out.replace(/(?:<br>\s*)+(?=<\/(?:p|li|h[234])>)/g, "");
  // Empty paragraphs produced by unwrapping carry nothing and render as gaps.
  out = out.replace(/<p class="rt-p">(?:\s|<br>)*<\/p>/g, "");

  return out.trim();
}

/** Drops the outer tag pair of any `li` whose first child level is an `li`. */
function unwrapNestedListItems(html: string): string {
  const parts = html.split(/(<\/?(?:li|ul|ol)\b[^>]*>)/);
  // Each open tag on the stack remembers where it sits in `parts`.
  const stack: { tag: string; at: number; dropped: boolean }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const token = parts[i];
    const tag = /^<\/?(li|ul|ol)/i.exec(token)![1].toLowerCase();
    if (token.startsWith("</")) {
      const open = stack.pop();
      if (open?.dropped) parts[i] = "";
      continue;
    }
    const top = stack[stack.length - 1];
    // Only an empty wrapper. `<li>text<li>` is an omitted end tag, which the
    // browser already closes on its own; unwrapping it would orphan "text".
    const wrapperIsEmpty = top && parts.slice(top.at + 1, i).join("").replace(/<[^>]*>/g, "").trim() === "";
    if (tag === "li" && top?.tag === "li" && !top.dropped && wrapperIsEmpty) {
      parts[top.at] = "";
      top.dropped = true;
    }
    stack.push({ tag, at: i, dropped: false });
  }
  return parts.join("");
}

/** A heading longer than this is prose. Roughly a clause and a half. */
const MAX_HEADING_CHARS = 90;

/** First N characters of plain text, for card excerpts and meta descriptions. */
export function plainTextExcerpt(html: string, max = 180): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, text.lastIndexOf(" ", max) || max).trimEnd()}…`;
}

/** Reading time at 200 wpm, floored at 1. */
export function readingMinutes(html: string): number {
  const words = html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
