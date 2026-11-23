import { RateLimiter } from "../security/rate-limit.ts";
import type { Invitee } from "./drive-invite.ts";

export const INVITES_PER_COLLEGE_PER_DAY = 50;
const DAY_MS = 24 * 3600_000;

/**
 * Caps invite mail: at most 50 a day per college, and one mail per address per drive per day (removing a company and
 * adding it back does not re-send). In memory like the repo's other limiters, so it holds per server instance.
 */
export class InviteGate {
  private readonly perCollege = new RateLimiter(INVITES_PER_COLLEGE_PER_DAY, DAY_MS, { bypassable: false });
  private readonly sentAt = new Map<string, number>();

  /** Forget that these addresses were mailed for this drive: a failed send, or a link reissue that voided the old invites. */
  forget(driveId: string, emails: string[]): void {
    for (const e of emails) this.sentAt.delete(`${driveId}:${e.trim().toLowerCase()}`);
  }

  /** `send`: mail these. `limited`: held back by the daily cap. Addresses already mailed today are in neither. */
  plan(collegeId: string, driveId: string, invitees: Invitee[], now = Date.now()): { send: Invitee[]; limited: Invitee[] } {
    for (const [k, at] of this.sentAt) if (now - at >= DAY_MS) this.sentAt.delete(k);
    const send: Invitee[] = [];
    const limited: Invitee[] = [];
    for (const i of invitees) {
      const key = `${driveId}:${i.email.trim().toLowerCase()}`;
      if (this.sentAt.has(key)) continue;
      if (!this.perCollege.take(`invite:${collegeId}`, now)) {
        limited.push(i);
        continue;
      }
      this.sentAt.set(key, now);
      send.push(i);
    }
    return { send, limited };
  }
}

export const inviteGate = new InviteGate();
