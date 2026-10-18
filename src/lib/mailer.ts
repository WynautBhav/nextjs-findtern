import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import nodemailer from "nodemailer";

export type SmtpAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

/**
 * SMTP mailer. No-ops with a warning when SMTP is not configured.
 *
 * MAIL_MODE=log (the default outside production) writes the message to
 * logs/mail/YYYY-MM-DD.log instead of sending it, so testing against a copy of
 * the live database never emails real people.
 */
export function mailMode(): "log" | "send" {
  const m = (process.env.MAIL_MODE ?? "").trim().toLowerCase();
  if (m === "send" || m === "log") return m;
  return process.env.NODE_ENV === "production" ? "send" : "log";
}

export async function sendSmtpMail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: SmtpAttachment[];
}) {
  if (mailMode() === "log") {
    const dir = join(process.cwd(), "logs", "mail");
    const entry = `--- ${new Date().toISOString()}\nTo: ${[opts.to].flat().join(", ")}\nSubject: ${opts.subject}\n${
      opts.attachments?.length ? `Attachments: ${opts.attachments.map((a) => a.filename).join(", ")}\n` : ""
    }\n${opts.text}\n\n`;
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${new Date().toISOString().slice(0, 10)}.log`), entry);
    console.info(`[mail:log] ${opts.subject} → ${[opts.to].flat().join(", ")}`);
    return { ok: true };
  }

  const from = (process.env.SMTP_FROM ?? "").trim();
  const host = (process.env.SMTP_HOST ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASS ?? "").trim();
  const portRaw = (process.env.SMTP_PORT ?? "").trim();
  const secureRaw = (process.env.SMTP_SECURE ?? "").trim().toLowerCase();

  if (!from || !host || !user || !pass) {
    console.warn("SMTP is not configured; email subject:", opts.subject);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: portRaw ? Number(portRaw) : 587,
    secure: secureRaw === "true" || secureRaw === "1",
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    return { ok: true };
  } catch (err) {
    console.error("Failed to send SMTP email to", opts.to, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
