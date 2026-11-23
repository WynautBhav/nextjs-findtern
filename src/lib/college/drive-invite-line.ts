// Client-safe (no node imports): the drive builder shows this line.

/** The one-line confirmation the officer sees after saving. */
export function inviteSentLine(sent: string[], failed: string[]): string | null {
  const ok = sent.length ? `${sent.length === 1 ? "Invite" : "Invites"} sent to ${sent.join(", ")}` : null;
  const bad = failed.length ? `Couldn't email ${failed.join(", ")}: send them the drive link yourself.` : null;
  return ok && bad ? `${ok}. ${bad}` : (ok ?? bad);
}
