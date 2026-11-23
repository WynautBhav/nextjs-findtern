// Client-safe (no node imports): the drive builder shows this line.

/** The one-line confirmation the officer sees after saving. */
export function inviteSentLine(sent: string[], failed: string[], limited: string[] = []): string | null {
  const ok = sent.length ? `${sent.length === 1 ? "Invite" : "Invites"} sent to ${sent.join(", ")}` : null;
  const rest = [
    failed.length ? `Couldn't email ${failed.join(", ")}: send them the drive link yourself.` : null,
    limited.length ? "Invite limit reached; try again tomorrow." : null,
  ].filter((x): x is string => x !== null);
  return ok ? [rest.length ? `${ok}.` : ok, ...rest].join(" ") : rest.length ? rest.join(" ") : null;
}
