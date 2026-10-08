import nodemailer from "nodemailer";

export type SmtpAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

/**
 * SMTP mailer. No-ops with a warning when SMTP is not configured, so local
 * development and CI never crash on a missing env var.
 */
export async function sendSmtpMail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: SmtpAttachment[];
}) {
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

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  });
}
