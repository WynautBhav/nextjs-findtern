/**
 * Website content collections the admin edits, described once. The API
 * validates against these fields and the editor renders forms from them.
 */

export type CmsField = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "image" | "number" | "select";
  required?: boolean;
  options?: string[];
  hint?: string;
};

export const CMS_COLLECTIONS = {
  testimonial: {
    label: "Testimonials",
    title: "name",
    subtitle: "company",
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
    title: "name",
    subtitle: "href",
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
    title: "question",
    subtitle: "category",
    toggle: true,
    fields: [
      { name: "question", label: "Question", kind: "text", required: true },
      { name: "answer", label: "Answer", kind: "textarea", required: true },
      { name: "category", label: "Category", kind: "text", required: true, hint: "e.g. general, interns, employers" },
      { name: "sortOrder", label: "Order", kind: "number" },
    ],
  },
  blog: {
    label: "Blog",
    title: "title",
    subtitle: "status",
    toggle: false,
    fields: [
      { name: "title", label: "Title", kind: "text", required: true },
      { name: "slug", label: "URL slug", kind: "text", required: true, hint: "lowercase-with-dashes" },
      { name: "excerpt", label: "Summary", kind: "textarea" },
      { name: "coverImageUrl", label: "Cover image", kind: "image" },
      { name: "bannerImageUrl", label: "Banner image", kind: "image" },
      { name: "body", label: "Article", kind: "textarea", required: true, hint: "Plain paragraphs or HTML." },
      { name: "status", label: "Status", kind: "select", options: ["draft", "published"] },
    ],
  },
  skill: {
    label: "Featured skills",
    title: "title",
    subtitle: "metaText",
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
} satisfies Record<string, { label: string; title: string; subtitle: string; toggle: boolean; fields: CmsField[] }>;

export type CmsType = keyof typeof CMS_COLLECTIONS;
export const CMS_TYPES = Object.keys(CMS_COLLECTIONS) as CmsType[];
