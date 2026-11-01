/**
 * Turns a browser's Content-Security-Policy violation report into short log
 * lines. Pure, so the rules (what is kept, what is dropped) are tested.
 *
 * Two wire formats exist: `report-uri` posts {"csp-report": {...}} with
 * hyphenated keys, the Reporting API posts [{type: "csp-violation", body: {...}}]
 * with camelCase keys. The report comes from any visitor's browser, so it is
 * untrusted text: it is cut to a few fields, query strings and fragments are
 * dropped (they can carry tokens), every field is length-capped, and control
 * characters are removed so a crafted report cannot forge a log line.
 */

export const MAX_REPORT_BYTES = 8 * 1024;
const MAX_FIELD = 160;
const MAX_LINES = 10;
// ASCII control characters, DEL and the Unicode line/paragraph separators, written as escapes in a string
// so no raw separator character sits inside a regex literal.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f\\u2028\\u2029]+", "g");

function clean(value: unknown): string {
  if (typeof value !== "string") return "-";
  // Keep scheme, host and path of a URL; keywords such as "inline" or "eval" pass through.
  let text = value;
  try {
    const u = new URL(value);
    text = `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    // not a URL
  }
  return text.replace(CONTROL, " ").trim().slice(0, MAX_FIELD) || "-";
}

type Fields = Record<string, unknown>;

function line(f: Fields): string {
  const directive = f["effective-directive"] ?? f.effectiveDirective ?? f["violated-directive"] ?? f.violatedDirective;
  const blocked = f["blocked-uri"] ?? f.blockedURL ?? f.blockedURI;
  const doc = f["document-uri"] ?? f.documentURL ?? f.documentURI;
  const disposition = f.disposition === "enforce" ? "enforce" : "report";
  return `[csp] ${clean(directive)} would block ${clean(blocked)} on ${clean(doc)} (${disposition})`;
}

/** Log lines for a raw report body; empty when it is not a report. */
export function summariseCspReport(raw: string): string[] {
  if (!raw || raw.length > MAX_REPORT_BYTES) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const found: Fields[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const entry = item as { type?: unknown; body?: unknown };
      if (entry && entry.type === "csp-violation" && entry.body && typeof entry.body === "object") found.push(entry.body as Fields);
    }
  } else if (data && typeof data === "object") {
    const legacy = (data as Fields)["csp-report"];
    if (legacy && typeof legacy === "object") found.push(legacy as Fields);
  }
  return found.slice(0, MAX_LINES).map(line);
}
