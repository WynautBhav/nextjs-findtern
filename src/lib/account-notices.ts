import { renderEmail, type EmailContent } from "./emails.ts";
import { sendSmtpMail, type MailResult } from "./mailer.ts";
import { SITE } from "./content/site.ts";
import { linkTo } from "./origin.ts";

/**
 * The emails an admin's activate/deactivate sends to the account's people. One helper for companies, interns and
 * college officers so the wording, the "only when the state really changed" rule and the failure handling live in
 * one place. Sent inline (the admin sees the result next to the button), never queued, and never able to fail the
 * admin action: every problem comes back as `emailFailed`.
 */
export type AccountKind = "employer" | "intern" | "college";

export const DISABLED_SUBJECT = "Your Findtern account has been disabled";
export const ENABLED_SUBJECT = "Your Findtern account is active again";

/** True only when the stored active flag actually changes: a repeat click or a bulk re-send mails nobody. */
export function shouldNotify(before: boolean, after: boolean): boolean {
  return before !== after;
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** The subject account named in the mail: the company, the candidate's first name context, or the college. */
export function accountNoticeEmail(o: { kind: AccountKind; active: boolean; name: string; greetingName?: string; adminEmail?: string }): EmailContent {
  const admin = o.adminEmail ?? SITE.adminEmail;
  const name = oneLine(o.name);
  const hi = `Hi ${oneLine(o.greetingName ?? "") || "there"},`;
  const loginPath = o.kind === "employer" ? "/login?as=employer" : o.kind === "college" ? "/login?as=college" : "/login?as=intern";
  if (!o.active) {
    const what =
      o.kind === "employer"
        ? `Your company account ${name} on Findtern has been disabled by our team.`
        : o.kind === "college"
          ? `The Findtern placement console account for ${name} has been disabled by our team.`
          : "Your Findtern account has been disabled by our team.";
    return {
      subject: DISABLED_SUBJECT,
      preheader: `You will not be able to sign in until it is re-enabled. Contact ${admin}.`,
      heading: "Your account has been disabled",
      greeting: hi,
      lines: [`${what} You will not be able to sign in until it is re-enabled. Please contact ${admin}.`],
      status: "Disabled",
      tone: "alert",
      cta: { label: "Contact admin", url: `mailto:${admin}` },
    };
  }
  const what =
    o.kind === "employer"
      ? `Your company account ${name} on Findtern is active again.`
      : o.kind === "college"
        ? `The Findtern placement console account for ${name} is active again.`
        : "Your Findtern account is active again.";
  const url = linkTo(loginPath);
  return {
    subject: ENABLED_SUBJECT,
    preheader: "You can sign in with your existing password.",
    heading: "Your account is active again",
    greeting: hi,
    lines: [`${what} You can sign in with your existing password.`],
    status: "Active",
    tone: "done",
    ...(url ? { cta: { label: "Sign in", url } } : {}),
  };
}

export type NoticeResult = { emailed: boolean; emailFailed: boolean; recipients: number };

export type NoticeDeps = { send: (m: { to: string; subject: string; text: string; html: string }) => Promise<MailResult> };
const realDeps: NoticeDeps = { send: (m) => sendSmtpMail(m) };

/** Addresses once each, ignoring case and blanks. */
export function uniqueAddresses(list: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of list) {
    const v = (a ?? "").trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/**
 * Mail each recipient the notice for the account's new state. `emailed`: at least one mail was accepted for real
 * delivery (false in MAIL_MODE=log, where it is only written to logs/mail); `emailFailed`: any send errored.
 * Never throws.
 */
export async function sendAccountNotice(
  o: { kind: AccountKind; active: boolean; name: string; to: { email: string; name?: string }[] },
  deps: NoticeDeps = realDeps,
): Promise<NoticeResult> {
  const seen = new Set<string>();
  const people = o.to.filter((p) => {
    const k = p.email.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let emailed = false;
  let emailFailed = false;
  for (const p of people) {
    try {
      const mail = renderEmail(accountNoticeEmail({ kind: o.kind, active: o.active, name: o.name, greetingName: p.name }));
      const res = await deps.send({ to: p.email.trim(), ...mail });
      if (res.ok && res.mode === "send") emailed = true;
      if (!res.ok) emailFailed = true;
    } catch (err) {
      emailFailed = true;
      console.error("[account-notice] send failed:", err instanceof Error ? err.message : err);
    }
  }
  return { emailed, emailFailed, recipients: people.length };
}

/** Run `fn` over `items`, at most `limit` at a time. */
export async function inBatches<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += limit) await Promise.all(items.slice(i, i + limit).map(fn));
}
