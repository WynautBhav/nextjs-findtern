/**
 * The line a person sees when a save fails. `fetch` rejects with a TypeError
 * ("Failed to fetch") when the network is down; never show that raw. An Error
 * thrown from a non-ok response already carries the server's own message.
 */
export function saveFailureMessage(error: unknown, offline = "Couldn't reach the server. Check your connection and try again."): string {
  if (error instanceof TypeError || !(error instanceof Error)) return offline;
  return error.message || offline;
}
