/**
 * Website content collections the admin edits, described once. The API
 * validates against these fields and the editor renders forms from them.
 *
 * Everything in here is pure (no database), so the browser editor and the
 * route share one set of rules and the rules are unit tested.
 */

export type CmsField = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "richtext" | "image" | "number" | "select";
  required?: boolean;
  options?: string[];
  hint?: string;
};

/** Legacy FAQ chips filter on exactly these two strings (DB-25). */
export const FAQ_CATEGORIES = ["Intern", "Employer"] as const;

export const CMS_COLLECTIONS = {
  testimonial: {
    label: "Testimonials",
    noun: "testimonial",
    title: "name",
    subtitle: "company",
    image: "avatarUrl",
    toggle: true,
    fields: [
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "company", label: "Company or college", kind: "text", required: true },
      { name: "quote", label: "Quote", kind: "textarea", required: true },
      { name: "avatarUrl", label: "Photo", kind: "image" },
      { name: "sortOrder", label: "Order", kind: "number" },
    ],
  },
  partner: {
    label: "Partners",
    noun: "partner",
    title: "name",
    subtitle: "href",
    image: "logoUrl",
    toggle: true,
    fields: [
      { name: "name", label: "Brand name", kind: "text", required: true },
      { name: "logoUrl", label: "Logo", kind: "image", required: true },
      { name: "href", label: "Website", kind: "text" },
      { name: "sortOrder", label: "Order", kind: "number" },
    ],
  },
  faq: {
    label: "FAQs",
    noun: "question",
    title: "question",
    subtitle: "category",
    image: null,
    toggle: true,
    fields: [
      { name: "category", label: "Shown to", kind: "select", required: true, options: [...FAQ_CATEGORIES] },
      { name: "question", label: "Question", kind: "text", required: true },
      { name: "answer", label: "Answer", kind: "textarea", required: true },
      { name: "sortOrder", label: "Order", kind: "number" },
    ],
  },
  blog: {
    label: "Blog",
    noun: "post",
    title: "title",
    subtitle: "slug",
    image: "coverImageUrl",
    toggle: false,
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "slug", label: "URL slug", kind: "text", required: true, hint: "Lowercase letters, numbers and dashes, e.g. hiring-interns-2026. Must be unique." },
      { name: "status", label: "Status", kind: "select", options: ["draft", "published"] },
      { name: "excerpt", label: "Summary", kind: "textarea" },
      { name: "coverImageUrl", label: "Cover image", kind: "image" },
      { name: "bannerImageUrl", label: "Banner image", kind: "image" },
      { name: "body", label: "Article", kind: "richtext" },
    ],
  },
  skill: {
    label: "Featured skills",
    noun: "skill",
    title: "title",
    subtitle: "metaText",
    image: null,
    toggle: true,
    fields: [
      { name: "title", label: "Skill", kind: "text", required: true },
      { name: "metaText", label: "Caption", kind: "text" },
      { name: "iconClass", label: "Icon name", kind: "text" },
      { name: "resourceCount", label: "Candidate count", kind: "number" },
      { name: "href", label: "Link", kind: "text" },
      { name: "sortOrder", label: "Order", kind: "number" },
    ],
  },
} satisfies Record<
  string,
  { label: string; noun: string; title: string; subtitle: string; image: string | null; toggle: boolean; fields: CmsField[] }
>;

export type CmsType = keyof typeof CMS_COLLECTIONS;
export const CMS_TYPES = Object.keys(CMS_COLLECTIONS) as CmsType[];

export function cmsFields(type: CmsType): readonly CmsField[] {
  return CMS_COLLECTIONS[type].fields as readonly CmsField[];
}

/** Legacy admin listed 10 per page. */
export const CMS_PAGE_SIZE = 10;

/* ── Values ──────────────────────────────────────────────────────────── */

/**
 * Size caps. Every legacy image is stored inline as a `data:` URI (the
 * largest live one is ~640k characters), so a 500-character cap made every
 * legacy testimonial, partner and blog post fail on save (ADM-21). URLs stay
 * short; inline images are allowed up to ~1.5 MB of text.
 */
export const MAX_IMAGE_URL = 2_000;
export const MAX_INLINE_IMAGE = 1_500_000;
/** Article bodies can carry inline images from the legacy editor. */
export const MAX_RICHTEXT = 3_000_000;

/**
 * Stand-in for a stored inline image in list rows and edit drafts:
 * "inline-image:<characters>". The data itself stays on the server (served by
 * /api/admin/cms/image), and because an edit sends only changed fields the
 * token is never posted back; if it were, `imageError` refuses it.
 */
export const INLINE_IMAGE_PREFIX = "inline-image:";

export function isInlineToken(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(INLINE_IMAGE_PREFIX);
}

/** Approximate decoded size of an inline token, for "Embedded image (640 KB)". */
export function inlineTokenKb(value: string): number {
  const chars = Number(value.slice(INLINE_IMAGE_PREFIX.length)) || 0;
  return Math.max(1, Math.round((chars * 0.75) / 1024));
}

/** Where to load a stored image from: its own URL, or the admin image route. */
export function cmsImageSrc(type: CmsType, id: string, field: string, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (isInlineToken(value)) return `/api/admin/cms/image?type=${type}&id=${encodeURIComponent(id)}&field=${field}`;
  return value;
}

export function isInlineImage(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

/** null when the value is an acceptable image reference, else the reason. */
export function imageError(value: string, label = "Image"): string | null {
  const v = value.trim();
  if (!v) return null;
  if (isInlineImage(v)) return v.length > MAX_INLINE_IMAGE ? `${label} is too large. Upload a smaller file instead.` : null;
  if (v.length > MAX_IMAGE_URL) return `${label} link is too long.`;
  if (/^(https?:\/\/|\/)/i.test(v)) return null;
  return `${label} must be an uploaded file or a link starting with https:// or /.`;
}

/** "interns", " employer " → the legacy chip value; null when unknown. */
export function normaliseFaqCategory(raw: unknown): (typeof FAQ_CATEGORIES)[number] | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "intern" || v === "interns" || v === "candidate" || v === "candidates") return "Intern";
  if (v === "employer" || v === "employers" || v === "company" || v === "companies") return "Employer";
  return null;
}

export const SLUG_RULE = "Slug: lowercase letters, numbers and dashes only";

/**
 * New and changed slugs follow the new rule; an unchanged legacy slug
 * ("Intern-10", "my_post.v2") is left alone so its post stays editable and its
 * public URL keeps working (ADM-23).
 */
export function slugError(next: unknown, previous?: string | null): string | null {
  const v = String(next ?? "").trim();
  if (!v) return "URL slug is required";
  if (previous != null && v === previous) return null;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) ? null : SLUG_RULE;
}

export type CmsDraft = Record<string, string>;

/** Form values for an item (or a blank new one). */
export function draftFromItem(type: CmsType, item: Record<string, unknown> | null): CmsDraft {
  return Object.fromEntries(
    cmsFields(type).map((f) => {
      if (!item) return [f.name, f.kind === "select" ? (f.options?.[0] ?? "") : ""];
      const raw = item[f.name];
      if (f.name === "category") return [f.name, normaliseFaqCategory(raw) ?? String(raw ?? "")];
      return [f.name, raw == null ? "" : String(raw)];
    }),
  );
}

/**
 * The PATCH body for an edit: only the fields that changed (so a stored
 * inline image is never re-sent and re-validated, ADM-21), and an emptied
 * optional field as `null` so the server clears it (ADM-22). A required field
 * left empty is sent as "" and refused by the server with its label.
 */
export function buildCmsPatch(type: CmsType, original: CmsDraft, draft: CmsDraft): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of cmsFields(type)) {
    const before = original[f.name] ?? "";
    const after = draft[f.name] ?? "";
    if (after === before) continue;
    out[f.name] = after.trim() === "" && !f.required && f.kind !== "number" ? null : after;
  }
  return out;
}

/** The POST body for a new item: blanks left out. */
export function buildCmsCreate(type: CmsType, draft: CmsDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of cmsFields(type)) {
    const v = draft[f.name] ?? "";
    if (v.trim() !== "") out[f.name] = v;
  }
  return out;
}

/** Case-insensitive match across the collection's text fields (legacy search). */
export function matchesCmsSearch(type: CmsType, item: Record<string, unknown>, needle: string): boolean {
  const words = needle.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = cmsFields(type)
    .filter((f) => f.kind === "text" || f.kind === "textarea" || f.kind === "select")
    .map((f) => String(item[f.name] ?? "").toLowerCase())
    .join(" \u0000 ");
  return words.every((w) => hay.includes(w));
}

/* ── Server-side validation ──────────────────────────────────────────── */

const TEXT_MAX: Record<CmsField["kind"], number> = {
  text: 2_000,
  textarea: 100_000,
  richtext: MAX_RICHTEXT,
  image: MAX_INLINE_IMAGE,
  number: 0,
  select: 0,
};

export type CmsValues = Record<string, string | number | null>;

/**
 * Validates a create (`partial: false`) or an edit (`partial: true`) body
 * against the collection. In an edit only the fields present are touched; an
 * optional field sent as null or "" is cleared, a required one is refused.
 * Unknown keys are dropped.
 */
export function validateCmsValues(
  type: CmsType,
  raw: Record<string, unknown>,
  opts: { partial: boolean; previousSlug?: string | null },
): { ok: true; values: CmsValues } | { ok: false; error: string } {
  const values: CmsValues = {};
  for (const f of cmsFields(type)) {
    const present = Object.prototype.hasOwnProperty.call(raw, f.name);
    if (!present) {
      if (!opts.partial && f.required) return { ok: false, error: `${f.label} is required` };
      continue;
    }
    const input = raw[f.name];
    const blank = input === null || input === undefined || (typeof input === "string" && input.trim() === "");

    if (f.kind === "number") {
      if (blank) {
        if (f.required) return { ok: false, error: `${f.label} is required` };
        values[f.name] = 0;
        continue;
      }
      const n = Number(input);
      if (!Number.isInteger(n) || n < 0 || n > 100_000) {
        return { ok: false, error: `${f.label} must be a whole number from 0 to 100000` };
      }
      values[f.name] = n;
      continue;
    }

    if (blank) {
      if (f.required) return { ok: false, error: `${f.label} is required` };
      values[f.name] = null;
      continue;
    }
    if (typeof input !== "string") return { ok: false, error: `${f.label} is invalid` };
    const v = f.kind === "richtext" || f.kind === "textarea" ? input : input.trim();

    if (f.kind === "select") {
      const picked =
        f.name === "category"
          ? normaliseFaqCategory(v)
          : ((f.options ?? []).find((o) => o === v.trim().toLowerCase()) ?? null);
      if (!picked) return { ok: false, error: `${f.label}: choose ${(f.options ?? []).join(" or ")}` };
      values[f.name] = picked;
      continue;
    }
    if (f.kind === "image") {
      const err = imageError(v, f.label);
      if (err) return { ok: false, error: err };
    } else if (v.length > TEXT_MAX[f.kind]) {
      return { ok: false, error: `${f.label} is too long` };
    }
    if (type === "blog" && f.name === "slug") {
      const err = slugError(v, opts.previousSlug ?? null);
      if (err) return { ok: false, error: err };
    }
    values[f.name] = v;
  }
  return { ok: true, values };
}
