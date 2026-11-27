import { collegeAdminMay } from "./access.ts";
import { driveShareUrl } from "./drive-input.ts";
import { driveDataOpen } from "./serialize.ts";
import { deriveDriveToken, tokenMatches } from "./tokens.ts";

type LinkDrive = { linkKey: string | null; tokenHash: string; startsAt: Date; endsAt: Date; revokedAt: Date | null };

/**
 * The drive link as the officer may see it again, or null. Only while the drive is open, only for a college admin who may
 * update drives, and only when the stored key still derives the stored hash (a drive made before the key existed has
 * none; a changed server secret would give a dead link). Used by the drive page alone: no API or list returns it.
 */
export function shownDriveLink(drive: LinkDrive, origin: string | null, secret: string, now = Date.now()): string | null {
  if (!drive.linkKey || !collegeAdminMay("drive:update") || !driveDataOpen(drive, now)) return null;
  const token = deriveDriveToken(drive.linkKey, secret);
  return tokenMatches(token, drive.tokenHash) ? driveShareUrl(origin, token) : null;
}
