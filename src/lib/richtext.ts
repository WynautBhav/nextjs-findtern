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
  //    wearing a heading tag, and becomes a paragraph.
  out = out.replace(
    /<h([234]) class="rt-h[234]">([\s\S]*?)<\/h\1>/gi,
    (_m, level: string, inner: string) => {
      const text = inner.replace(/<[^>]*>/g, "").trim();
      const looksLikeProse =
        text.length > MAX_HEADING_CHARS || /[.!?,;]$/.test(text);
      if (looksLikeProse) return `<p class="rt-p">${inner}</p>`;
      // Surviving headings are re-levelled one step up so the document starts
      // at h2: the h3/h4 mix from Docs becomes a clean h2/h3 outline.
      const lifted = Math.max(2, Number(level) - 1);
      return `<h${lifted} class="rt-h${lifted}">${inner}</h${lifted}>`;
    },
  );

  // 5. Collapse the whitespace left behind by unwrapping.
  out = out.replace(/(^|[^<])\s{2,}/g, "$1 ");
  // Empty paragraphs produced by unwrapping carry nothing and render as gaps.
  out = out.replace(/<p class="rt-p">\s*<\/p>/g, "");

  return out.trim();
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
