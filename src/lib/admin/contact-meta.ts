/**
 * Contact-message envelope, shared by the in-app report widget (writer) and
 * the admin inbox (reader).
 *
 * The legacy app (server/routes.ts `/api/support/feedback`) stores support
 * reports as plain text with header lines, and its admin inbox parses them
 * back out (admin-contact-messages.tsx `parseSupportMeta`):
 *
 *   kind: report
 *   userType: intern
 *   userId: <id>
 *   pageUrl: https://findtern.in/dashboard
 *   message:
 *   <body, any number of lines>
 *   video: /uploads/support/<file>
 *   attachments: /uploads/support/<a>, /uploads/support/<b>
 *
 * Both apps share the table, so the new app writes the same shape and reads
 * every shape that is in it: legacy reports, website contact-form messages
 * (no header at all) and the first new-app rows ("Attachment: <url>").
 *
 * Pure functions only, so the parsing is unit tested.
 */

export type ContactKind = "report" | "feedback" | "website";
export type ContactRole = "intern" | "employer";

export type ContactMeta = {
  /** Legacy kind: in-app "report" / "feedback"; null for the website form. */
  kind: "report" | "feedback" | "website" | null;
  /** Sender role from the header (or the query type for website messages). */
  role: ContactRole | null;
  userId: string | null;
  pageUrl: string | null;
  /** Optional finer topic the new widget adds (bug / idea / question). */
  topic: string | null;
  /** The message without its header and attachment lines. */
  body: string;
  /** Safe, clickable file links: video first, then attachments, then URLs in the body. */
  files: ContactFile[];
};

export type ContactFile = { href: string; name: string; type: "image" | "video" | "pdf" | "file" };

const HEADER = /^([A-Za-z][A-Za-z ]{0,39}):\s*(.*)$/;
const KNOWN_HEADERS = new Set(["kind", "usertype", "userid", "pageurl", "topic"]);
const FILE_LINE = /^(video|attachments?)\s*:\s*(.*)$/i;
const SUPPORT_FILE = /^\/api\/admin\/support-file\/[A-Za-z0-9_.-]+$/;
const LEGACY_UPLOAD = /^\/uploads\/[\w\-./%]+$/;

/**
 * Turns a stored link into a same-origin path the admin can open, or null.
 * Only the two access-checked file routes are allowed: `/uploads/...`
 * (legacy store, admin-only for support files) and the new support-file
 * route. Absolute legacy links (`https://findtern.in/uploads/x`) keep only
 * their path, so they open through the same check.
 */
export function safeFileHref(raw: string): string | null {
  let value = raw.trim().replace(/[),.\]]+$/g, "");
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  } else if (value.startsWith("uploads/")) {
    value = `/${value}`;
  }
  if (value.includes("..")) return null;
  if (SUPPORT_FILE.test(value) || LEGACY_UPLOAD.test(value)) return value;
  return null;
}

function fileOf(href: string): ContactFile {
  const name = decodeURIComponent(href.split("/").pop() ?? "file");
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const type: ContactFile["type"] = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
    ? "image"
    : ["mp4", "webm", "mov", "m4v"].includes(ext)
      ? "video"
      : ext === "pdf"
        ? "pdf"
        : "file";
  return { href, name, type };
}

/** Every file URL in free text (legacy `extractUploadUrlsFromText` + the new route). */
export function filesInText(text: string): string[] {
  const matches = text.match(/(https?:\/\/[^\s,]+|\/uploads\/[\w\-./%]+|(?<![\w/])uploads\/[\w\-./%]+|\/api\/admin\/support-file\/[A-Za-z0-9_.-]+)/gi) ?? [];
  return matches.map(safeFileHref).filter((x): x is string => Boolean(x));
}

function roleOf(value: string | null | undefined): ContactRole | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.includes("employer") || v === "hiring" || v === "hiring partner") return "employer";
  if (v.includes("intern")) return "intern";
  return null;
}

export function parseContactMessage(message: string, queryType?: string | null): ContactMeta {
  const lines = String(message ?? "").replace(/\r\n?/g, "\n").split("\n");
  const meta: Record<string, string> = {};
  let bodyStart = 0;
  let sawHeader = false;

  // Header block: known keys up to "message:" (legacy) or the first other line.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (sawHeader) continue;
      break;
    }
    const m = HEADER.exec(line);
    if (!m) break;
    const key = m[1].trim().toLowerCase();
    if (key === "message") {
      meta.message = m[2].trim();
      bodyStart = i + 1;
      sawHeader = true;
      break;
    }
    if (!KNOWN_HEADERS.has(key)) break;
    meta[key] = m[2].trim();
    sawHeader = true;
    bodyStart = i + 1;
  }

  // Trailing file lines (legacy writes them after the body).
  let bodyEnd = lines.length;
  const declared: string[] = [];
  for (let i = lines.length - 1; i >= bodyStart; i--) {
    const line = lines[i].trim();
    if (!line) {
      bodyEnd = i;
      continue;
    }
    const m = FILE_LINE.exec(line);
    if (!m) break;
    declared.unshift(...m[2].split(",").map((s) => s.trim()).filter(Boolean));
    bodyEnd = i;
  }

  const bodyLines = lines.slice(bodyStart, bodyEnd);
  if (meta.message) bodyLines.unshift(meta.message);
  // First new-app rows: "Attachment: <url>" on its own line inside the body.
  const kept: string[] = [];
  for (const line of bodyLines) {
    const m = /^\s*attachment\s*:\s*(\S+)\s*$/i.exec(line);
    if (m && safeFileHref(m[1])) declared.push(m[1]);
    else kept.push(line);
  }
  const body = kept.join("\n").trim();

  const hrefs = [...declared.map(safeFileHref), ...filesInText(body)].filter((x): x is string => Boolean(x));
  const files = [...new Set(hrefs)].map(fileOf);

  const kindRaw = (meta.kind ?? "").toLowerCase();
  const kind = kindRaw === "report" || kindRaw === "feedback" || kindRaw === "website" ? kindRaw : null;

  return {
    kind,
    role: roleOf(meta.usertype) ?? roleOf(queryType),
    userId: meta.userid?.trim() || null,
    pageUrl: meta.pageurl?.trim() || null,
    topic: meta.topic?.trim() || null,
    body: sawHeader || declared.length ? body : String(message ?? "").trim(),
    files,
  };
}

/** Legacy kind for a new-widget topic: broken things are reports, the rest feedback. */
export function legacyKindOf(topic: string): "report" | "feedback" {
  return topic === "bug" || topic === "report" ? "report" : "feedback";
}

/** Builds the stored text in the legacy envelope (see the module comment). */
export function formatSupportMessage(input: {
  kind: "report" | "feedback";
  userType: "intern" | "employer" | "admin";
  userId?: string | null;
  pageUrl?: string | null;
  topic?: string | null;
  message: string;
  video?: string | null;
  attachments?: string[];
}): string {
  const parts = [`kind: ${input.kind}`, `userType: ${input.userType}`];
  if (input.userId) parts.push(`userId: ${input.userId}`);
  if (input.pageUrl) parts.push(`pageUrl: ${input.pageUrl}`);
  if (input.topic) parts.push(`topic: ${input.topic}`);
  parts.push("message:");
  parts.push(input.message.trim());
  if (input.video) parts.push(`video: ${input.video}`);
  if (input.attachments?.length) parts.push(`attachments: ${input.attachments.join(", ")}`);
  return parts.join("\n");
}

/**
 * A page URL from the browser, kept only when it is an http(s) URL or a
 * site path, trimmed to a sane length. It is shown to staff as a link, so
 * nothing else (javascript:, data:) is ever stored.
 */
export function cleanPageUrl(raw: unknown): string | null {
  const value = String(raw ?? "").trim().slice(0, 500);
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
