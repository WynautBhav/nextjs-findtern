import { eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { renderEmail } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mailer";
import { notifyDetailed } from "@/lib/notify";
import { driveCodeSecret } from "@/lib/drives/code-derive";
import { inviteGate } from "./drive-invite-limit";
import { canSendInvites, driveInviteEmail, invitePath, inviteSig, withUnsent, type Invitee } from "./drive-invite";

type InviteDrive = { id: string; title: string; kind: string; startsAt: Date; endsAt: Date; revokedAt?: Date | null; tokenHash: string };

/**
 * Tell each invited company about the drive, after the drive row is saved. Mail goes through the app's mailer, so
 * MAIL_MODE=log writes it to logs/mail instead of sending. A company that already has an employer account (the
 * login address is its company email) gets the same mail through notify(), which also puts an alert in its app.
 * Never throws: the drive is saved either way. Resolves who was reached, who failed and who the daily cap held back.
 * An ended drive gets none (it refuses every join). `resend` is for a link reissue, which voided the invites sent before.
 */
export async function sendDriveInvites(drive: InviteDrive, collegeId: string, collegeName: string, all: Invitee[], opts: { resend?: boolean } = {}): Promise<{ sent: string[]; failed: string[]; limited: string[] }> {
  const sent: string[] = [];
  const failed: string[] = [];
  if (!canSendInvites({ ...drive, revokedAt: drive.revokedAt ?? null })) return { sent, failed, limited: [] };
  if (opts.resend) inviteGate.forget(drive.id, all.map((i) => i.email));
  // Per-college daily cap and one mail per address per drive per day (drive-invite-limit.ts); the drive is saved regardless.
  const { send: invitees, limited } = inviteGate.plan(collegeId, drive.id, all);
  if (invitees.length === 0) return { sent, failed, limited: limited.map((i) => i.email) };
  let accounts = new Map<string, string>();
  try {
    const rows = await getDb()
      .select({ id: schema.employers.id, email: schema.employers.companyEmail })
      .from(schema.employers)
      .where(inArray(sql`lower(${schema.employers.companyEmail})`, invitees.map((i) => i.email.toLowerCase())));
    accounts = new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));
  } catch (err) {
    console.error("[drive-invite] account lookup failed", err);
  }
  await Promise.all(
    invitees.map(async (i) => {
      try {
        const path = invitePath(drive.id, i.email, inviteSig(driveCodeSecret(), drive.id, drive.tokenHash, i.email));
        const content = driveInviteEmail({ company: i.company, collegeName, driveTitle: drive.title, kind: drive.kind, startsAt: drive.startsAt, endsAt: drive.endsAt, path });
        const employerId = accounts.get(i.email.toLowerCase());
        if (employerId) {
          const r = await notifyDetailed({
            to: { type: "employer", id: employerId },
            type: "drive_invite",
            title: `${collegeName} invited you to a campus drive`,
            message: `"${drive.title}" is open to ${i.company}. Open the invite to enter the drive.`,
            data: { driveId: drive.id, path },
            email: content,
          });
          (r.inApp && !r.emailFailed ? sent : failed).push(i.email);
        } else {
          const res = await sendSmtpMail({ to: i.email, ...renderEmail(content) });
          (res.ok ? sent : failed).push(i.email);
        }
      } catch (err) {
        console.error("[drive-invite] invite failed", err);
        failed.push(i.email);
      }
    }),
  );
  // A failed mail does not use up the address's one send a day: the next save may try again.
  inviteGate.forget(drive.id, failed);
  return { sent, failed, limited: limited.map((i) => i.email) };
}

/**
 * sendDriveInvites, then record who was not reached (`unsent` on the saved list) so the next save, or a link reissue,
 * mails them. `list` is the drive's saved invited list; `toSend` the companies to mail now.
 */
export async function sendAndRecordInvites(drive: InviteDrive, collegeId: string, collegeName: string, list: Invitee[], toSend: Invitee[], opts: { resend?: boolean } = {}) {
  const invites = await sendDriveInvites(drive, collegeId, collegeName, toSend, opts);
  if (toSend.length > 0) {
    try {
      await getDb()
        .update(schema.collegeDrives)
        .set({ invitedEmployers: withUnsent(list, [...invites.failed, ...invites.limited]) })
        .where(eq(schema.collegeDrives.id, drive.id));
    } catch (err) {
      console.error("[drive-invite] could not record unsent invites", err);
    }
  }
  return invites;
}
