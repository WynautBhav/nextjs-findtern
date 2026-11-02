/**
 * What switching "open to work" does to a profile's `extra_data`.
 *
 * A hidden profile stays hidden until the intern switches it back on; nothing
 * turns it on for them. `hiddenAt` records when the switch went off and is
 * kept across repeat "off" saves. A profile staff hid (`hiddenByAdmin`) is not
 * the intern's to switch back on: that stays until staff un-hide it.
 */
export function openToWorkPatch(next: boolean, previous: Record<string, unknown>): Record<string, unknown> {
  if (next) {
    if (previous.hiddenByAdmin === true) return {};
    return { openToWork: true, hiddenAt: null };
  }
  const alreadyHidden = previous.openToWork === false && typeof previous.hiddenAt === "string";
  return {
    openToWork: false,
    hiddenAt: alreadyHidden ? previous.hiddenAt : new Date().toISOString(),
  };
}
