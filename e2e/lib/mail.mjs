/**
 * Reads the MAIL_MODE=log outbox: logs/mail/<YYYY-MM-DD>.log (UTC date),
 * written by src/lib/mailer.ts as blocks of
 *
 *   --- <iso timestamp>
 *   To: a@x, b@y
 *   Subject: …
 *   [Attachments: …]
 *
 *   <text body>
 *
 * Every file is read (a run can cross UTC midnight) and entries are filtered
 * by timestamp, so mail from earlier runs never satisfies an assertion.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { MAIL_DIR } from "./env.mjs";

const HEADER = /^--- (\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/m;

export async function readMail({ since = 0 } = {}) {
  let files = [];
  try {
    files = (await readdir(MAIL_DIR)).filter((f) => f.endsWith(".log")).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    const raw = await readFile(join(MAIL_DIR, f), "utf8");
    const parts = raw.split(/^(?=--- \d{4}-\d{2}-\d{2}T)/m);
    for (const part of parts) {
      const m = HEADER.exec(part);
      if (!m) continue;
      const at = Date.parse(m[1]);
      if (at < since) continue;
      const body = part.slice(m.index + m[0].length).replace(/^\n/, "");
      const to = /^To: (.*)$/m.exec(body)?.[1]?.split(",").map((s) => s.trim().toLowerCase()) ?? [];
      const subject = /^Subject: (.*)$/m.exec(body)?.[1] ?? "";
      const attachments = /^Attachments: (.*)$/m.exec(body)?.[1] ?? "";
      const blank = body.indexOf("\n\n");
      const text = blank >= 0 ? body.slice(blank + 2).trim() : "";
      out.push({ at, to, subject, attachments, text, raw: part });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Mail to `address` since `since`, optionally narrowed by subject. */
export async function mailTo(address, { since = 0, subject } = {}) {
  const all = await readMail({ since });
  return all.filter(
    (m) => m.to.includes(address.toLowerCase()) && (!subject || (subject instanceof RegExp ? subject.test(m.subject) : m.subject.includes(subject))),
  );
}

/**
 * Wait for a matching message. Some sends run after the response (Next's
 * `after()`), so a message can land a moment after the request returns.
 */
export async function waitForMail(address, { since = 0, subject, timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await mailTo(address, { since, subject });
    if (found.length) return found[found.length - 1];
    if (Date.now() > deadline) {
      const seen = (await mailTo(address, { since })).map((m) => m.subject);
      throw new Error(
        `No email to ${address} matching ${subject ?? "(any)"} within ${timeoutMs}ms. Seen for this address: ${JSON.stringify(seen)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** The 6-digit signup code in an OTP email. */
export function otpFrom(message) {
  const m = /Verification code\D{0,20}(\d{6})/i.exec(message.text) ?? /\b(\d{6})\b/.exec(message.text);
  if (!m) throw new Error(`No 6-digit code in email "${message.subject}"`);
  return m[1];
}
